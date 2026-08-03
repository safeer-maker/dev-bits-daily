# Celery + Redis + Flower — Concepts

## The Problem: LLM Inference Blocks Everything

LLM inference takes 1–30 seconds. If you run it synchronously inside a FastAPI request handler, you block:

- The HTTP connection (client must wait with socket open)
- The FastAPI event loop (no other requests can be processed)
- Scaling horizontally (each server can only handle one request at a time)

The solution is to **decouple** the API layer from the inference layer using an **async task queue**.

---

## TechBot Case Scenario

**Scenario:** 50 users send messages to TechBot simultaneously. Each inference takes 3 seconds.

**Without Celery:** The API server processes one at a time. User 50 waits 150 seconds (50 × 3s). The server appears hung.

**With Celery:**
1. FastAPI immediately accepts all 50 requests and returns a task_id (< 10ms each)
2. All 50 tasks enter the Redis queue
3. Celery workers (on separate machines with GPUs) pick up tasks and process them concurrently
4. Users poll `GET /task/{task_id}` every 500ms to check if their result is ready
5. When a worker finishes, the result is stored in Redis. The next poll returns it.

Total user-perceived wait: 3 seconds (their own inference time), regardless of how many others are asking simultaneously.

---

## Architecture Overview

```
┌─────────────┐        ┌──────────────────┐        ┌───────────────────┐
│   FastAPI   │──push──│   Redis Broker   │──pull──│  Celery Worker    │
│   (API GW)  │        │   (task queue)   │        │  (GPU machine)    │
│             │        │                  │        │                   │
│  POST /chat │        │  Queue: "gpu"    │        │  runs inference() │
│  → task_id  │        │  Queue: "cpu"    │        │  → stores result  │
│             │        │                  │        │       ↓           │
│  GET /task/ │◄───────│  Redis Backend   │◄───────│  task-meta-{id}   │
│  → result   │        │  (result store)  │        │                   │
└─────────────┘        └──────────────────┘        └───────────────────┘
```

**Redis serves TWO roles here:**
1. **Broker:** Stores the task messages (the queue itself). Workers poll this.
2. **Result Backend:** Stores task results after workers finish. API reads from this.

These can be the same Redis instance on different DB numbers:
- `redis://localhost:6379/0` → broker
- `redis://localhost:6379/1` → result backend

Or for simplicity, the same URL for both (common in development).

---

## Celery Components

### Task

A Python function decorated with `@app.task`. Celery serializes its arguments to JSON, puts the message on the Redis queue, and a worker executes it.

```python
@app.task(bind=True, max_retries=3)
def run_inference(self, session_id: str, user_message: str):
    # This runs on the worker, not the API server
    result = call_vllm(user_message)
    return result
```

`bind=True` gives the task access to `self` — the task instance — which you need for `self.retry()`.

### Worker

A separate process (or machine) that polls the Redis broker for tasks and executes them.

```bash
celery -A celery_app worker --queues=gpu --concurrency=1 --pool=solo
```

### Beat (not used in TechBot)

A scheduler that enqueues tasks on a cron schedule. For periodic jobs, not request-response.

---

## Redis as Celery Broker

When you call `run_inference.delay(session_id, message)`, Celery:

1. Serializes the task arguments to JSON
2. Pushes a message to the Redis List: `_kombu.binding.gpu` (or the queue name you specified)
3. Sets metadata in Redis about the task state: `celery-task-meta-{task_id}` → `{"status": "PENDING"}`

When a worker is ready for a new task:
1. It calls `BLPOP` on the queue key (blocking left-pop — waits until a message arrives)
2. Pops the task message
3. Deserializes and executes the function
4. Updates the result key: `celery-task-meta-{task_id}` → `{"status": "SUCCESS", "result": "..."}`

---

## Visibility Timeout: Critical for Long Tasks

The visibility timeout is how long a task can run before the broker considers it "lost" and re-queues it.

```python
broker_transport_options={"visibility_timeout": 7200}  # 2 hours
```

**Problem:** If a worker takes 5 minutes on a task but the visibility timeout is 3600 seconds (1 hour), that's fine. But if the timeout is 60 seconds, the broker re-queues the task after 60 seconds even though the worker is still processing it. You get duplicate task execution.

**Rule:** Set `visibility_timeout` ≥ your longest possible task duration, with a safety margin.

---

## Task Reliability Settings

```python
task_acks_late=True          # Worker ACKs the task AFTER it completes (not on pickup)
task_reject_on_worker_lost=True  # Re-queue if worker crashes mid-task
```

Without `task_acks_late`, if a worker crashes after picking up a task but before finishing, the task is lost. With it, the task is re-queued on worker failure.

---

## Named Queues and Task Routing

Not all tasks are equal. GPU inference is heavy; email sending is trivial. Route them to different queues:

```python
app.conf.task_routes = {
    "tasks.inference.run_inference": {"queue": "gpu"},
    "tasks.embedding.*":             {"queue": "cpu"},
    "tasks.notifications.*":         {"queue": "low_priority"},
}
```

Start separate workers for each queue:

```bash
# GPU worker — 1 task at a time, no forking (CUDA isn't fork-safe)
celery -A celery_app worker \
  --queues=gpu \
  --concurrency=1 \
  --pool=solo \
  --hostname=gpu-worker@%h

# CPU worker — many tasks in parallel
celery -A celery_app worker \
  --queues=cpu,low_priority \
  --concurrency=8 \
  --pool=prefork \
  --hostname=cpu-worker@%h
```

### Why `--pool=solo` for GPU workers?

CUDA is **not fork-safe**. If you use the default `prefork` pool on a GPU worker, Celery forks child processes, and PyTorch/CUDA deadlocks. `--pool=solo` runs tasks serially in a single process — safe for CUDA, and correct for a single GPU anyway (the GPU can only run one inference at a time).

---

## FastAPI + Celery Pattern: Submit and Poll

```python
# POST /chat — submit task, return immediately
@app.post("/chat")
async def chat(session_id: str, message: str):
    task = run_inference.apply_async(
        args=[session_id, message],
        queue="gpu"
    )
    return {"task_id": task.id}  # returns in < 10ms

# GET /task/{task_id} — client polls this
@app.get("/task/{task_id}")
async def get_result(task_id: str):
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.ready():
        return {"status": result.state, "response": result.get()}
    return {"status": result.state}   # "PENDING" or "STARTED"
```

Client polling loop (pseudocode):
```
POST /chat → {task_id: "abc-123"}
every 500ms: GET /task/abc-123
    → {status: "PENDING"}
    → {status: "PENDING"}
    → {status: "SUCCESS", response: "Here's how to reset your password..."}
```

Alternative: use WebSocket or SSE (Server-Sent Events) for push notification instead of polling.

---

## Flower — Task Monitoring Dashboard

Flower is a web-based real-time monitor for Celery. It connects to your Redis broker and shows:

- **Workers:** which are online, their status, task counts, CPU/memory usage
- **Tasks:** real-time feed of active, completed, failed, retried tasks with args, kwargs, runtime, result
- **Queues:** current queue lengths
- **Broker stats:** message throughput

```bash
# Start Flower
celery -A celery_app flower --port=5555 --broker=redis://localhost:6379/0

# With password protection
celery -A celery_app flower --port=5555 --basic_auth=admin:secret

# Access at http://localhost:5555
```

**Use Flower to:**
- See if your GPU workers are idle (queue backed up → add more workers)
- Debug failed tasks (see the error traceback)
- Monitor inference latency per task
- Verify task routing (tasks going to correct queues)

---

## Worker Max Tasks Per Child

Workers that load large models (like sentence-transformers or vLLM) can accumulate memory leaks over time:

```python
worker_max_tasks_per_child=100  # restart worker process after 100 tasks
```

After 100 tasks, Celery gracefully restarts the worker process, freeing accumulated memory. The model is reloaded in the new process.

---

## What Comes Next

In `02_hands_on.ipynb` you will:
1. Configure `celery_app.py` with Redis broker and result backend
2. Define `run_inference` and `generate_embedding` tasks
3. Set up task routing (gpu queue vs cpu queue)
4. Start workers via terminal commands
5. Submit tasks from a FastAPI endpoint
6. Poll for results
7. Open Flower and observe the tasks running in real-time
8. Simulate a worker failure and verify task re-queuing
