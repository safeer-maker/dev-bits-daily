# Redis Fundamentals — Concepts

## What is Redis?

Redis (Remote Dictionary Server) is an **in-memory data structure store**. Every key and value lives in RAM, which is why it is dramatically faster than disk-based databases.

It can act simultaneously as:
- A **database** (persistent storage with RDB/AOF)
- A **cache** (TTL-based key expiry)
- A **message broker** (Pub/Sub, Streams, Celery backend)
- A **vector search engine** (Redis Stack with RediSearch)

### Redis vs Relational DB — Mental Model

| | PostgreSQL | Redis |
|---|---|---|
| Storage | Disk-first | RAM-first |
| Query language | SQL | One command per data structure |
| Schema | Enforced via DDL | Schema-free |
| Joins | Native | Application-layer only |
| Latency | 1–10 ms typical | < 1 ms typical |
| Persistence | Always durable | Configurable |
| Transactions | Full ACID | Atomic batches only (MULTI/EXEC) |
| Primary use | Source of truth | Cache, session, queue, index |

**Key insight:** You would never replace PostgreSQL with Redis. You use both — Postgres stores your canonical data, Redis stores derived/fast-access data.

---

## Redis is Single-Threaded (for commands)

Redis processes one command at a time in a single thread. There are no locks and no race conditions within a single command. This is why `INCR` is safely atomic — no two clients can read-increment-write simultaneously.

The trade-off: one slow command (e.g. `KEYS *` on a huge dataset) blocks all other clients. Always use `SCAN` in production instead of `KEYS`.

---

## Data Structures

Redis is NOT just a key-value store. It has **typed values** — the value attached to a key can be one of many data structures.

### 1. String

The simplest type. Holds text, integers, serialized JSON, or binary blobs (up to 512 MB).

```
SET  user:1001:name "Alice"
GET  user:1001:name            → "Alice"
INCR counter:page_views        → atomically increment integer
SETEX session:abc 3600 "data"  → set + expire in 3600 seconds
```

**AI use case:** Store serialized model config, API tokens, request counters.

---

### 2. Hash

A map of field → value pairs stored under one key. Think of it as a row in a table.

```
HSET user:1001 name "Alice" age 30 role "admin"
HGET user:1001 name           → "Alice"
HMGET user:1001 name age      → ["Alice", "30"]
HGETALL user:1001             → {"name":"Alice", "age":"30", "role":"admin"}
HDEL user:1001 age
```

**AI use case:** Store chat session metadata (user_id, model, system_prompt, created_at).

Memory note: Redis internally uses a compact `ziplist` encoding for small Hashes (< 128 fields, values < 64 bytes). This makes them very memory-efficient.

---

### 3. List

A doubly-linked list of strings. O(1) push/pop from either end.

```
RPUSH chat:session123:messages '{"role":"user","content":"Hello"}'
RPUSH chat:session123:messages '{"role":"assistant","content":"Hi"}'
LRANGE chat:session123:messages 0 -1   → all messages (index 0 to last)
LRANGE chat:session123:messages -5 -1  → last 5 messages
LLEN chat:session123:messages          → count
LTRIM chat:session123:messages -100 -1 → keep only last 100 items
```

**AI use case:** Chat message history. Each message is a JSON string pushed to the right (RPUSH). Fetch with LRANGE. Trim with LTRIM to cap memory.

---

### 4. Set

Unordered collection of unique strings. O(1) add/remove/membership check.

```
SADD session:abc:tags "premium" "en" "rag"
SISMEMBER session:abc:tags "premium"  → 1 (yes) or 0 (no)
SMEMBERS session:abc:tags             → {"premium", "en", "rag"}
SCARD session:abc:tags                → 3
```

**AI use case:** Track which features a session has enabled, or which documents have been processed.

---

### 5. Sorted Set (ZSet)

Like a Set, but every member has a floating-point **score**. Members are ordered by score. O(log N) add/query.

```
ZADD model:latency:log 1716500000.0 "call:001"
ZADD model:latency:log 1716500010.5 "call:002"
ZRANGE model:latency:log 0 -1 WITHSCORES   → all entries, ascending
ZRANGEBYSCORE model:latency:log 1716500000 1716500010
ZREVRANGE model:latency:log 0 9 WITHSCORES → top 10 by score desc
```

**AI use case:** Priority queues for tasks (score = priority), time-ordered event log (score = unix timestamp), leaderboard of model performance.

---

### 6. Stream

Append-only log with consumer groups. This is the closest Redis analog to Kafka. Each entry has an auto-generated ID.

```
XADD inference:events * model "llama3" tokens 512 latency_ms 340
XREAD COUNT 10 STREAMS inference:events 0
XGROUP CREATE inference:events workers $ MKSTREAM
XREADGROUP GROUP workers consumer1 COUNT 5 STREAMS inference:events >
```

**AI use case:** Log every inference call for audit, analytics, or replay. Consumer groups let multiple workers each process different events.

---

### 7. JSON (RedisJSON module — part of Redis Stack)

Stores native JSON documents. Supports JSONPath for field-level access and modification.

```
JSON.SET doc:1001 $ '{"name":"Alice","scores":[0.1,0.2]}'
JSON.GET doc:1001 $.name           → ["Alice"]
JSON.ARRAPPEND doc:1001 $.scores 0.3
JSON.NUMINCRBY doc:1001 $.scores[0] 0.05
```

**AI use case:** Store RAG document chunks with their metadata and embedding in one JSON document. RedisVL uses JSON storage internally.

---

## TTL / Key Expiry

Every key can have an expiration time. After the TTL elapses, Redis deletes the key automatically.

```python
import redis
r = redis.Redis(host="localhost", port=6379, decode_responses=True)

r.setex("session:abc", 3600, "data")     # set + 3600s TTL in one call
r.expire("chat:session:messages", 86400) # set TTL on existing key
r.ttl("session:abc")                     # remaining seconds (-1 = no TTL, -2 = key gone)
r.persist("session:abc")                 # remove TTL (make permanent)
```

Redis expires keys in two ways:
- **Lazy expiry:** Check TTL when the key is accessed; delete if expired.
- **Active expiry:** Redis scans ~20 random volatile keys 10 times per second and deletes expired ones.

**Pattern for chat sessions:** Use a sliding TTL — reset it on every message so active sessions stay alive and idle ones expire.

```python
def add_message(r, session_id, role, content):
    key = f"chat:{session_id}:messages"
    r.rpush(key, json.dumps({"role": role, "content": content}))
    r.ltrim(key, -100, -1)    # cap at 100 messages
    r.expire(key, 86400)      # sliding 24-hour TTL
```

---

## Persistence Modes

Redis is in-memory, but it can persist to disk in two ways:

### RDB — Point-in-Time Snapshots

Redis forks a child process and writes a binary snapshot of all data.

```conf
# redis.conf
save 900 1       # snapshot if ≥1 key changed in 900 seconds
save 300 10      # snapshot if ≥10 keys changed in 300 seconds
save 60 10000    # snapshot if ≥10000 keys changed in 60 seconds
dbfilename dump.rdb
dir /data
```

- **Pro:** Fast restart, compact file, minimal CPU overhead at steady state
- **Con:** Can lose data written since the last snapshot

### AOF — Append-Only File

Every write command is appended to a log file. On restart, Redis replays all commands.

```conf
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec   # safest practical option: at most 1 second of data loss
```

- **Pro:** Near-zero data loss
- **Con:** File grows unbounded; use `BGREWRITEAOF` to compact it

### Recommended for production: Both

```conf
appendonly yes
save 900 1
```

Redis uses AOF for recovery (more complete) and RDB for fast backup shipping.

### Pure cache mode (no persistence)

```conf
save ""
appendonly no
```

---

## Eviction Policies

When Redis runs out of memory (set via `maxmemory`), it evicts keys based on the policy:

```bash
CONFIG SET maxmemory 4gb
CONFIG SET maxmemory-policy allkeys-lru
```

| Policy | Behavior | Use When |
|--------|----------|----------|
| `noeviction` | Returns error on write | Data loss is unacceptable |
| `allkeys-lru` | Evict least recently used | **Default for AI caches** |
| `allkeys-lfu` | Evict least frequently used | Stable hot-key access patterns |
| `volatile-lru` | LRU only among keys with TTL | Mixed cache + persistent data |
| `volatile-ttl` | Evict shortest-TTL key first | TTL encodes importance |

For AI workloads where Redis is purely a cache, **`allkeys-lru` is the standard choice**.

Monitor eviction health:
```bash
redis-cli INFO stats | grep evicted_keys
redis-cli INFO stats | grep keyspace_hits
redis-cli INFO stats | grep keyspace_misses
```

A good cache should have `keyspace_hits / (keyspace_hits + keyspace_misses)` > 80%.

---

## Pub/Sub

Fire-and-forget message fanout. One publisher, multiple subscribers.

```bash
# Terminal 1 — subscriber
redis-cli SUBSCRIBE channel:model:updates

# Terminal 2 — publisher
redis-cli PUBLISH channel:model:updates '{"model":"llama3","status":"deployed"}'
```

**Important:** Messages are lost if no subscriber is active when the message is published. For reliable messaging, use **Streams** instead.

**AI use case:** Notify all connected websocket clients when a new inference result is ready. Not for critical message delivery.

---

## Redis Stack vs Vanilla Redis

Vanilla Redis (open source) does NOT include:
- Vector similarity search
- Native JSON documents
- Full-text search

You need **Redis Stack**, which bundles:
- **RediSearch** — full-text + vector similarity search (KNN)
- **RedisJSON** — native JSON storage + JSONPath
- **RedisTimeSeries** — time-series data
- **RedisBloom** — probabilistic data structures (HyperLogLog-like)

```bash
# Always use redis-stack for AI work
docker run -d --name redis-stack \
  -p 6379:6379 -p 8001:8001 \
  redis/redis-stack:latest
```

---

## Key Naming Convention

Redis has no namespacing — all keys live in a flat keyspace. Use colons as separators:

```
{entity}:{id}:{attribute}
```

Examples from TechBot:
```
chat:{session_id}:messages          → List of chat messages
chat:{session_id}:metadata          → Hash of session info
doc:{doc_id}                        → Hash/JSON for a RAG document
llm:exact:{sha256}                  → Exact prompt cache entry
vllm-cache:{hash}                   → Semantic cache internal key
celery-task-meta-{task_id}          → Celery result backend
idx:chat_history                    → RediSearch index name
rag-docs                            → Vector store index name
```

**Avoid:**
- `KEYS *` in production (blocks Redis; use `SCAN` instead)
- Very long key names (stored in RAM; keep them short but readable)
- Special characters other than `:`, `-`, `_`
