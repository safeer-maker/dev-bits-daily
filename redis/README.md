# Redis for AI — Complete Learning Path

## What You Will Build

By the end of this guide you will have built a **production-grade RAG chatbot** that uses every Redis capability covered here:

```
User Message
    ↓
FastAPI Gateway
    ↓ check semantic cache first (< 5ms if hit)
Redis Semantic Cache ──── HIT ──→ return response immediately
    ↓ MISS
Celery Task Queue (Redis as broker)
    ↓ GPU worker picks up task
Celery Worker
    ├── fetch chat history from Redis
    ├── retrieve relevant docs from Redis Vector Store (RAG)
    ├── build full prompt (system + history + context + query)
    ↓
vLLM Inference Server
    ↓
response stored in Redis (cache + history + result backend)
    ↓
Client polls GET /task/{id} → gets response
```

---

## Case Scenario: "TechBot"

Throughout all modules, every exercise builds toward **TechBot** — a customer support chatbot for a software company. It:

- Remembers your conversation (chat history in Redis)
- Knows the product documentation (RAG via Redis Vector Store)
- Avoids calling the LLM for repeated questions (semantic cache)
- Handles concurrent users without blocking (Celery + Redis broker)
- Is monitored in real-time (Flower dashboard)
- Runs inference on a local LLM via vLLM

Each module introduces one piece of TechBot's infrastructure.

---

## Folder Structure

```
redis/
├── README.md                       ← you are here
│
├── 00_fundamentals/
│   ├── 01_concepts.md              ← What Redis is, data structures, persistence, eviction
│   └── 02_hands_on.ipynb           ← Connect, CRUD, TTL, all data types hands-on
│
├── 01_chat_history/
│   ├── 01_concepts.md              ← How sessions work, key naming, TTL patterns
│   └── 02_hands_on.ipynb           ← Build TechBot's memory layer
│
├── 02_vector_store/
│   ├── 01_concepts.md              ← Redis Stack, HNSW vs FLAT, index schema
│   └── 02_hands_on.ipynb           ← Ingest docs, embed, store, KNN query, hybrid search
│
├── 03_semantic_cache/
│   ├── 01_concepts.md              ← Exact vs semantic cache, cost math, threshold tuning
│   └── 02_hands_on.ipynb           ← SemanticCache + LangChain integration
│
├── 04_celery_flower/
│   ├── 01_concepts.md              ← Celery architecture, Redis broker vs backend, Flower
│   └── 02_hands_on.ipynb           ← Async inference pipeline + Flower monitoring
│
├── 05_chatbot_project/             ← Full TechBot implementation
│   ├── README.md
│   ├── docker-compose.yml
│   ├── requirements.txt
│   ├── celery_app.py
│   ├── main.py                     ← FastAPI gateway
│   ├── tasks/inference.py          ← Celery task (RAG + cache + vLLM)
│   └── scripts/
│       ├── ingest_docs.py          ← Load docs into vector store
│       └── test_chat.py            ← End-to-end test
│
└── 06_vllm_integration/
    ├── 01_concepts.md              ← vLLM prefix caching, Redis in front of vLLM
    └── 02_hands_on.ipynb           ← Redis semantic cache as vLLM gateway
```

---

## Prerequisites

### Start Redis Stack (required for ALL modules)

```bash
docker run -d \
  --name redis-stack \
  -p 6379:6379 \
  -p 8001:8001 \
  -e REDIS_ARGS="--appendonly yes" \
  -v redis-stack-data:/data \
  redis/redis-stack:latest
```

- Port `6379` — Redis server (all client connections)
- Port `8001` — RedisInsight GUI at http://localhost:8001

### Install Python packages

```bash
pip install redis redisvl langchain-redis langchain-openai \
            sentence-transformers celery[redis] flower \
            fastapi uvicorn httpx numpy
```

---

## Learning Order

| Step | Module | New Concept | TechBot Piece |
|------|--------|-------------|---------------|
| 1 | `00_fundamentals` | Redis data structures, TTL, persistence | Foundation |
| 2 | `01_chat_history` | Lists, Hashes, RedisChatMessageHistory | TechBot memory |
| 3 | `02_vector_store` | RedisVL, HNSW index, KNN search | TechBot knowledge base |
| 4 | `03_semantic_cache` | SemanticCache, exact cache | TechBot cost saver |
| 5 | `04_celery_flower` | Celery tasks, Redis broker, Flower | TechBot scale |
| 6 | `05_chatbot_project` | All combined | Full TechBot |
| 7 | `06_vllm_integration` | vLLM + Redis gateway | TechBot inference |
