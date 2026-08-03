# Redis as Vector Store — Concepts

## The Problem

TechBot needs to answer questions about the product docs. It can't fit all docs into the context window. Instead, it retrieves the 3–5 most *relevant* doc chunks and feeds only those to the LLM. This is **RAG — Retrieval-Augmented Generation**.

The retrieval step requires a **vector database**: store documents as embeddings, then find the nearest embeddings to a user query.

Redis Stack (via RediSearch) is a production-grade vector database built into the same Redis instance you already use for caching and chat history.

---

## TechBot Case Scenario

**Scenario:** TechBot has 500 documentation pages. When a user asks "How do I reset my password?", TechBot:

1. Embeds the question into a 384-dimensional vector
2. Searches Redis for the 5 doc chunks with the highest cosine similarity to that vector
3. Injects those 5 chunks into the LLM prompt
4. The LLM answers using only the relevant context

Without RAG, the LLM would hallucinate or say "I don't know." With RAG, it answers accurately from real docs.

---

## What is an Embedding?

An embedding is a list of floating-point numbers that represents the **meaning** of a piece of text in a high-dimensional space. Similar meanings → vectors that are close to each other.

```
"How do I install the SDK?"  →  [0.021, -0.134, 0.087, ...]   (384 numbers)
"SDK installation guide"     →  [0.019, -0.141, 0.091, ...]   (384 numbers, very close)
"The weather is nice today"  →  [-0.312, 0.456, -0.201, ...]  (very far away)
```

The distance between two embedding vectors measures their semantic similarity.

### Common embedding models

| Model | Dimensions | Source | Speed | Cost |
|-------|-----------|--------|-------|------|
| `all-MiniLM-L6-v2` | 384 | HuggingFace | Very fast | Free (local) |
| `all-mpnet-base-v2` | 768 | HuggingFace | Fast | Free (local) |
| `text-embedding-3-small` | 1536 | OpenAI API | Fast | ~$0.02/1M tokens |
| `text-embedding-3-large` | 3072 | OpenAI API | Moderate | ~$0.13/1M tokens |

For TechBot, we use `all-MiniLM-L6-v2` — free, fast, good quality, runs on CPU.

---

## Redis Stack — Required Modules

Vanilla Redis has no vector search. You need **Redis Stack**, which adds:

- **RediSearch** — powers vector similarity search + full-text search
- **RedisJSON** — stores documents as JSON instead of Hashes
- **RedisTimeSeries** — time-series (not needed here)
- **RedisBloom** — probabilistic data structures (not needed here)

```bash
docker run -d --name redis-stack \
  -p 6379:6379 -p 8001:8001 \
  redis/redis-stack:latest
```

---

## Vector Index Algorithms: FLAT vs HNSW

### FLAT (Brute Force)

- **How:** Compares the query vector against every stored vector, one by one
- **Recall:** 100% exact — never misses the true nearest neighbor
- **Speed:** O(N × D) — linear in the number of vectors
- **Memory:** O(N) — just stores vectors
- **Use when:** < 100K vectors, or when exact results are required

### HNSW (Hierarchical Navigable Small World)

- **How:** Builds a multi-layer proximity graph during indexing; queries navigate the graph
- **Recall:** ~95–99% — approximate, but tunable
- **Speed:** O(log N) — logarithmic, very fast even at millions of vectors
- **Memory:** O(N × M × 2) — stores the graph connections
- **Use when:** > 100K vectors, production workloads, when speed matters more than perfect recall

### Key HNSW parameters

| Parameter | What it controls | Trade-off |
|-----------|-----------------|-----------|
| `m` | Connections per node in graph | Higher = better recall, more memory |
| `ef_construction` | Build-time search depth | Higher = better graph quality, slower indexing |
| `ef_runtime` | Query-time search depth | Higher = better recall, slower query |

Standard production values: `m=16`, `ef_construction=200`, `ef_runtime=10` (tune up if recall is too low).

---

## Distance Metrics

| Metric | Formula | Best for |
|--------|---------|----------|
| `COSINE` | 1 - (A·B / |A||B|) | Text embeddings (standard) |
| `L2` | √Σ(Aᵢ-Bᵢ)² (Euclidean) | Image embeddings, normalized vectors |
| `IP` | -A·B (inner product) | When vectors are pre-normalized |

For text embeddings from sentence-transformers or OpenAI, always use **COSINE**.

---

## Index Schema — What You Define

A RediSearch vector index requires a schema that tells Redis:
- Where to find the vectors (field name)
- What other fields exist for filtering (TEXT, TAG, NUMERIC)
- Which algorithm and parameters to use

```python
schema = {
    "index": {
        "name": "rag-docs",
        "prefix": "doc",           # all keys starting with "doc:" are indexed
        "storage_type": "hash"     # or "json" (RedisJSON)
    },
    "fields": [
        {"name": "text",      "type": "text"},     # full-text searchable content
        {"name": "source",    "type": "tag"},       # exact filter: "manual" | "blog" | "api"
        {"name": "category",  "type": "tag"},       # exact filter: "auth" | "install" | "sdk"
        {"name": "page",      "type": "numeric"},   # range filter: page <= 10
        {"name": "embedding", "type": "vector",
         "attrs": {
             "algorithm":       "hnsw",
             "dims":            384,               # must match your embedding model output
             "distance_metric": "cosine",
             "datatype":        "float32",
             "m":               16,
             "ef_construction": 200,
             "ef_runtime":      10
         }}
    ]
}
```

---

## The Full RAG Pipeline (What Happens Step by Step)

### Ingestion (one-time or periodic)

```
Documentation text
    ↓ chunk into ~500-word segments
Text chunks
    ↓ sentence-transformers model
Embeddings (float32 arrays, 384 dims)
    ↓ redisvl index.load()
Redis (stored as Hashes with embedding bytes + metadata)
    ↓
RediSearch HNSW index built automatically
```

### Retrieval (at query time, < 5ms)

```
User question: "How do I reset my password?"
    ↓ same embedding model
Query vector (384 float32 values)
    ↓ KNN search with optional filter
Redis returns top-5 nearest document chunks
    ↓ inject into LLM prompt
LLM generates answer grounded in real docs
```

---

## Hybrid Search: Vector + Metadata Filter

Pure vector search returns the nearest vectors globally. Hybrid search adds a pre-filter:

```
"Find the 5 most semantically similar docs TO this query,
 BUT ONLY among docs with source='manual' AND page <= 20"
```

This is powerful for:
- Restricting results to a specific document collection
- Filtering by date, category, or access permission
- Multi-tenant setups where users can only see their own docs

Redis RediSearch supports this natively — the filter runs first (or in-HNSW depending on selectivity), then the KNN search operates on the filtered set.

---

## Memory and Scale

Each 384-dim float32 vector = 384 × 4 bytes = **1,536 bytes** (~1.5 KB).

HNSW overhead (m=16): approximately `4 × m × 2 × 8` bytes ≈ 1 KB per vector for graph links.

Practical storage: ~3 KB per document (vector + metadata + graph) for 384-dim.

| Documents | Storage |
|-----------|---------|
| 10,000 | ~30 MB |
| 100,000 | ~300 MB |
| 1,000,000 | ~3 GB |

For TechBot's 500 doc pages (chunked to ~3,000 chunks): ≈ 9 MB — trivial.

---

## RedisVL — The Right Python Client

**`redisvl`** is Redis's official Python library for vector operations. It abstracts away the raw RediSearch commands and provides:

- `SearchIndex` — create and manage vector indexes
- `VectorQuery` — run KNN searches
- `FilterExpression` — build metadata filters
- `SemanticCache` — LLM response caching (covered in module 03)
- `RedisChatMessageHistory` — session memory (covered in module 01 via `langchain-redis`)

```bash
pip install redisvl  # current: 0.3.x
```

---

## What Comes Next

In `02_hands_on.ipynb` you will:
1. Start Redis Stack via Docker
2. Define a vector index schema for TechBot's docs
3. Generate embeddings for sample doc chunks using `all-MiniLM-L6-v2`
4. Ingest documents into Redis
5. Run a KNN search: "How do I install the SDK?"
6. Run a hybrid search: same query but only in category "install"
7. Inspect the index in RedisInsight
8. Integrate the retriever into a LangChain RAG chain
