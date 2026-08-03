# TechBot — Full Project

This is the complete implementation of TechBot, a RAG-powered customer support chatbot that uses every Redis capability covered in the previous modules.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser / App)                      │
│                 POST /chat  {session_id, message}                │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                        FASTAPI GATEWAY (main.py)                 │
│  1. Receive request                                              │
│  2. Submit Celery task → return task_id immediately              │
│  3. Client polls GET /task/{task_id}                             │
└───────────────┬──────────────────────────────────────────────────┘
                │ task enqueue
                ▼
┌──────────────────────┐         ┌─────────────────────────────────┐
│   REDIS BROKER (db0) │         │         REDIS STACK             │
│   Queue: "gpu"       │         │                                 │
│   Queue: "cpu"       │         │  Chat History (RedisChatMsgHist)│
└───────────┬──────────┘         │  idx:chat_history               │
            │ worker polls       │                                 │
            ▼                    │  Vector Store (HNSW)            │
┌──────────────────────┐         │  rag-docs index                 │
│  CELERY WORKER (GPU) │         │                                 │
│  pool=solo           │         │  Semantic Cache                 │
│                      │         │  vllm-cache index               │
│  1. Check sem cache  │─────────│                                 │
│  2. RAG retrieval    │─────────│  Result Backend                 │
│  3. Get chat history │─────────│  celery-task-meta-{id}          │
│  4. Build prompt     │         └─────────────────────────────────┘
│  5. Call vLLM        │─── HTTP ──→ vLLM server (:8000)
│  6. Store in cache   │
│  7. Save to history  │
│  8. Write result     │
└──────────────────────┘

FLOWER dashboard: http://localhost:5555
RedisInsight GUI:  http://localhost:8001
TechBot API:       http://localhost:9000
```

## Quickstart

### 1. Start Redis Stack

```bash
docker run -d \
  --name redis-stack \
  -p 6379:6379 \
  -p 8001:8001 \
  -e REDIS_ARGS="--appendonly yes" \
  -v redis-stack-data:/data \
  redis/redis-stack:latest
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Ingest documentation

```bash
python scripts/ingest_docs.py
```

### 4. Start vLLM (optional — skip to use fake LLM)

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3-8B-Instruct \
  --port 8000 \
  --enable-prefix-caching
```

### 5. Start Celery worker

```bash
# GPU worker (use --pool=prefork if no GPU)
celery -A celery_app worker \
  --queues=gpu \
  --concurrency=1 \
  --pool=solo \
  --hostname=gpu-worker@%h \
  --loglevel=info
```

### 6. Start Flower monitoring

```bash
celery -A celery_app flower --port=5555
```

### 7. Start FastAPI

```bash
uvicorn main:api --host 0.0.0.0 --port 9000 --reload
```

### 8. Test the chatbot

```bash
python scripts/test_chat.py
```

## Project Files

```
05_chatbot_project/
├── README.md            ← this file
├── requirements.txt     ← Python dependencies
├── docker-compose.yml   ← Full stack in one command
├── celery_app.py        ← Celery configuration
├── main.py              ← FastAPI gateway
├── tasks/
│   ├── __init__.py
│   └── inference.py     ← Celery task: semantic cache + RAG + vLLM
└── scripts/
    ├── ingest_docs.py   ← Load docs into Redis vector store
    └── test_chat.py     ← End-to-end chatbot test
```

## Environment Variables

```bash
export REDIS_URL=redis://localhost:6379
export VLLM_URL=http://localhost:8000/v1/completions
export VLLM_MODEL=meta-llama/Llama-3-8B-Instruct
export USE_FAKE_LLM=true  # set to false when vLLM is running
```
