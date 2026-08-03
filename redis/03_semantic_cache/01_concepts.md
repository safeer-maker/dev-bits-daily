# Semantic Cache — Concepts

## The Problem: LLM API Calls Are Expensive and Slow

Every call to an LLM API (OpenAI, Anthropic, or your vLLM server) costs:
- **Time:** 500ms – 10 seconds depending on output length
- **Money:** GPT-4o costs ~$5/million input tokens + $15/million output tokens

In production, **30–70% of queries are near-duplicates** — rephrased versions of the same question. Why call the LLM 100 times when 70 of those calls would return the same answer?

A cache stores previous LLM responses. When a new query is semantically similar to a cached one, return the cached answer. No LLM call, no cost, < 5ms response time.

---

## TechBot Case Scenario

**Scenario:** In one hour, 1,000 users ask TechBot about password reset:

```
"How do I reset my password?"
"I forgot my password, what do I do?"
"Password reset instructions please"
"Can I change my password?"
"My password doesn't work"
```

Without cache: 1,000 LLM calls × $0.003/call = $3.00 per hour, every answer takes 2 seconds.

With semantic cache (assuming 70% hit rate): 300 LLM calls, 700 cache hits.
- Cost: 300 × $0.003 = $0.90 (70% savings)
- Cache hits respond in < 5ms
- LLM calls respond in 2 seconds

At scale (100,000 users/hour), the savings become substantial.

---

## Two Types of Cache

### Approach A: Exact Key Cache

Hash the exact prompt string and use it as the Redis key. Only byte-identical prompts get a cache hit.

```
"How do I reset my password?"   →  SHA256  →  "a3f2..."  →  Redis key "llm:exact:a3f2..."
"How do I reset my Password?"   →  SHA256  →  "b7d1..."  →  DIFFERENT key — cache MISS
```

**Pro:** Zero false positives. Every hit is guaranteed correct.

**Con:** Only catches exact duplicates. In practice, users rephrase constantly.

**Use when:** Deterministic pipelines where the same prompt is submitted many times (batch jobs, scheduled reports).

### Approach B: Semantic Cache (Embedding-Based)

Embed the prompt into a vector. Store (prompt_vector, response) in Redis. On a new query:
1. Embed the new query
2. Run KNN search to find the nearest cached prompt
3. If cosine distance ≤ threshold, return the cached response

```
"How do I reset my password?"       →  [0.21, -0.14, ...]  →  store
"I forgot my password, what do I do?" →  [0.19, -0.16, ...]  →  distance=0.08 < 0.15 → HIT
"The weather is nice today"           →  [-0.31, 0.45, ...]  →  distance=1.2 > 0.15  → MISS
```

**Pro:** Catches rephrased versions of the same question.

**Con:** Requires a distance threshold — too tight and you miss obvious paraphrases; too loose and you return wrong cached answers.

---

## Distance Threshold Tuning

The threshold is the most critical parameter. It controls the semantic similarity required for a cache hit.

**Cosine distance in Redis:** ranges from 0 to 2.
- 0 = identical vectors (same text)
- 1 = completely orthogonal (unrelated)
- 2 = exactly opposite

Practical thresholds for text embeddings:
| Threshold | Behavior | Risk |
|-----------|----------|------|
| 0.05 | Very strict — only near-identical phrasing | Few hits, low false positives |
| 0.10–0.15 | Standard — catches obvious paraphrases | **Good default** |
| 0.20–0.25 | Loose — catches topic-level similarity | Risk of returning wrong cached answer |
| > 0.30 | Too loose for most use cases | High false positive rate |

**Start with 0.15 and tune based on:**
- User feedback (wrong answers = threshold too high)
- Cache hit rate (low hits = threshold too low)
- Domain specificity (medical/legal → use tighter threshold)

---

## How SemanticCache Works Internally (redisvl)

```python
from redisvl.extensions.llmcache import SemanticCache
```

**On `cache.store(prompt, response)`:**
1. Embeds `prompt` using the configured embedding model
2. Stores in Redis as a HASH with fields:
   - `prompt` — original prompt text
   - `response` — LLM response text
   - `prompt_vector` — bytes of the float32 embedding
   - `inserted_at` — unix timestamp
   - `metadata` — optional dict
3. Applies TTL if configured

**On `cache.check(prompt)`:**
1. Embeds `prompt`
2. Runs a KNN vector search (FLAT algorithm internally — because cache entries are typically < 100K)
3. Returns all cache entries with distance ≤ threshold
4. Returns empty list if no match

---

## Cache Architecture in TechBot

```
User message: "I forgot my password"
    ↓
1. Embed the message (384-dim vector)
2. Redis KNN search against vllm-cache index
    ↓
    CACHE HIT (distance < 0.15):
        ↓
        Return cached response in < 5ms
        Skip LLM call entirely

    CACHE MISS:
        ↓
3. RAG retrieval from Redis Vector Store
4. Celery task → vLLM inference
5. Store response in cache for next time
6. Store in chat history
```

The semantic cache check is step 1 — before RAG, before Celery, before anything expensive.

---

## LangChain Integration

LangChain's `RedisSemanticCache` wraps redisvl and hooks into LangChain's caching layer:

```python
import langchain
from langchain_redis import RedisSemanticCache
from langchain_openai import OpenAIEmbeddings

cache = RedisSemanticCache(
    embeddings=OpenAIEmbeddings(),
    redis_url="redis://localhost:6379",
    distance_threshold=0.15,
    ttl=3600,
    name="langchain-cache"
)

# Set globally — all LangChain LLM calls go through the cache
langchain.globals.set_llm_cache(cache)
```

After this, any `llm.invoke(...)` call is automatically checked against the cache first.

---

## Cache Invalidation

TTL-based invalidation is the simplest and most common strategy:

- **Global TTL:** All cache entries expire after N seconds. Simple, predictable.
- **Sliding TTL:** Reset TTL on each cache hit. Hot entries stay alive; cold entries expire.
- **Model version invalidation:** Include the model name/version in the cache's `llm_string` field. Upgrading the model automatically causes cache misses (new model = different `llm_string`).
- **Manual clear:** Call `cache.clear()` when you update your knowledge base significantly.

For TechBot:
- 3600s (1 hour) TTL for general queries
- No TTL for time-insensitive documentation answers
- Manual clear when docs are updated

---

## What Comes Next

In `02_hands_on.ipynb` you will:
1. Implement an exact cache with SHA256 key
2. Implement `SemanticCache` with redisvl
3. Tune the distance threshold by testing similar/different prompts
4. Use `RedisSemanticCache` with LangChain
5. Measure cache hit rate and latency improvement
6. Implement cache invalidation on TTL + manual clear
