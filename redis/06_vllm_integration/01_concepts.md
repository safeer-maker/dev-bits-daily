# vLLM + Redis Integration — Concepts

## What is vLLM?

vLLM is a high-throughput inference engine for large language models. It's what you run locally instead of calling OpenAI's API — faster than Hugging Face's default pipeline, supports many concurrent requests, and exposes an OpenAI-compatible REST API.

Key features:
- **PagedAttention:** GPU memory management that enables batching many requests efficiently
- **Continuous batching:** Dynamically groups incoming requests to maximize GPU utilization
- **OpenAI-compatible API:** Drop-in replacement for `openai` Python client
- **Prefix caching:** Avoids recomputing KV cache for shared prompt prefixes

---

## TechBot Case Scenario

**Scenario:** TechBot uses vLLM to run Llama-3-8B locally. Without caching, every question hits vLLM and takes 2–4 seconds. With Redis as a semantic cache in front of vLLM, repeated questions return in < 5ms.

Redis and vLLM operate at different caching levels:
- **Redis:** Application-level cache. Stores complete LLM responses. Works across requests from different users.
- **vLLM:** GPU-level KV cache. Stores intermediate attention computation for shared prompt prefixes. Works within one vLLM instance.

Both are complementary — Redis catches repeated semantic queries; vLLM caches shared computation for novel queries.

---

## Starting vLLM

```bash
# Install
pip install vllm

# Start OpenAI-compatible server
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3-8B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.9 \
  --enable-prefix-caching          # enable vLLM's internal KV prefix caching
```

Test it:
```bash
curl http://localhost:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "meta-llama/Llama-3-8B-Instruct", "prompt": "Hello", "max_tokens": 50}'
```

---

## vLLM's Internal Prefix Caching

Enabled via `--enable-prefix-caching`. This is entirely **in-GPU-memory** and requires no Redis.

**How it works:**

vLLM divides each prompt into 16-token blocks. Each block gets a hash:
```
hash(parent_block_hash, block_tokens, lora_id)
```

When a new request arrives, vLLM checks if any of its prompt blocks match previously computed blocks in the GPU KV cache. If they match, it reuses those KV tensors — skipping the forward pass for those tokens.

**Example — TechBot multi-turn conversation:**

Turn 1: `[system_prompt] + [user: "How do I install?"] + [assistant: "Run pip install..."]`
Turn 2: `[system_prompt] + [user: "How do I install?"] + [assistant: "Run pip install..."] + [user: "And authenticate?"]`

The first 3 segments are identical. vLLM reuses their KV cache — only the new `[user: "And authenticate?"]` part runs through the forward pass. This reduces TTFT (Time to First Token) by 60–80% in multi-turn chats.

**When prefix caching is most valuable:**
- Multi-turn chat (shared system prompt + conversation history)
- RAG (retrieved context often repeats across similar queries)
- Few-shot examples (fixed example block in every prompt)
- Batch processing with shared preambles

---

## Redis as Application-Level Cache in Front of vLLM

Redis and vLLM's prefix cache serve different purposes:

| | Redis Semantic Cache | vLLM Prefix Cache |
|--|---------------------|-------------------|
| Scope | Cross-user, cross-request | Within one vLLM instance |
| What it stores | Complete responses (text) | KV tensors (GPU memory) |
| Hit latency | < 5ms | < 100ms (skip partial forward pass) |
| Exact vs semantic | Semantic (embedding distance) | Exact (token-level hash) |
| Persistence | Survives server restart (TTL) | Lost on server restart |
| Requires LLM call | No (full cache hit) | Partial (new tokens only) |

**Best of both worlds:** Redis catches semantically similar queries across all users. For queries that miss Redis, vLLM's prefix cache speeds up computation for any shared prefix.

---

## Redis Gateway in Front of vLLM

```
Client request
    ↓
FastAPI Gateway
    ↓ embed query (384-dim)
Redis SemanticCache KNN search
    ↓
    HIT  (distance < 0.15) → return in < 5ms, no vLLM call
    MISS → forward to vLLM
             ↓
         vLLM inference (uses prefix caching internally)
             ↓
         store in Redis SemanticCache
             ↓
         return response
```

---

## LMCache: Distributed KV Cache via Redis (Advanced)

For multi-node vLLM deployments, **LMCache** extends vLLM's KV cache across nodes using Redis as shared storage.

**Problem it solves:** Node A computes the KV tensors for a long system prompt. Node B gets a similar request but has no KV cache — it must recompute from scratch.

**LMCache solution:** After computing, Node A serializes the KV tensors and stores them in Redis. Node B fetches them from Redis instead of recomputing.

```bash
pip install lmcache
```

Redis keys for each cached chunk:
```
{hash}@metadata   → HASH with chunk info
{hash}@kv_bytes   → STRING (binary-pickled KV tensors)
```

This is an advanced setup — only relevant when running vLLM across multiple GPU nodes. For TechBot (single node), vLLM's built-in prefix caching is sufficient.

---

## vLLM + Celery Integration

In TechBot's full architecture:

```python
# tasks/inference.py
@app.task(bind=True, max_retries=3)
def run_inference(self, session_id: str, prompt: str):
    # Redis semantic cache already checked in FastAPI before task was queued
    # (or check again here for cache warmth between task queuing and execution)
    
    try:
        import httpx
        resp = httpx.post(
            "http://vllm-server:8000/v1/completions",
            json={"model": "meta-llama/Llama-3-8B-Instruct",
                  "prompt": prompt, "max_tokens": 512},
            timeout=120.0
        )
        return resp.json()["choices"][0]["text"].strip()
    except httpx.TimeoutException as exc:
        raise self.retry(exc=exc, countdown=30)
```

vLLM is called via HTTP from inside the Celery worker. The Celery worker runs on the same machine as vLLM (or on a GPU node in the cluster).

---

## Prompt Engineering for Prefix Caching

To maximize vLLM prefix cache hits, structure prompts so the **most shared content comes first**:

```
[SYSTEM PROMPT — same for all users]
[RAG CONTEXT — same for users asking similar things]
[CONVERSATION HISTORY]
[USER QUERY — unique per request]
```

Avoid putting the user's unique query early in the prompt — it would invalidate the prefix hash for everything after it.

---

## What Comes Next

In `02_hands_on.ipynb` you will:
1. Start vLLM with a small model (Llama-3-8B or similar)
2. Call vLLM directly via the OpenAI-compatible API
3. Add a Redis SemanticCache gateway in front of vLLM
4. Measure latency with and without cache
5. Observe vLLM's prefix caching benefit in multi-turn conversation
6. Wire the full stack: FastAPI → Redis cache → Celery → vLLM
