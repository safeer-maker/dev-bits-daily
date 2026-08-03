# Chat History in Redis — Concepts

## The Problem

A stateless LLM has no memory. Every time you call it, it starts fresh. For a chatbot, you need to:

1. Store the conversation history somewhere
2. Retrieve the last N turns before each new LLM call
3. Expire old sessions automatically
4. Handle millions of concurrent sessions without running out of memory

Redis is the standard solution for all four.

---

## TechBot Case Scenario

**Scenario:** A user opens TechBot and asks:

```
User: How do I install the SDK?
Bot: Run pip install techbot-sdk
User: What about on Windows?
Bot: Same command — pip install techbot-sdk works on Windows too.
User: And how do I authenticate?
```

For the third message, TechBot needs to know the first two exchanges to understand the context ("authenticate" with what? the SDK!). That history lives in Redis.

---

## Storage Design

### Key Structure

```
chat:{session_id}:messages    → Redis List of serialized JSON strings
chat:{session_id}:metadata    → Redis Hash (user_id, model, system_prompt, created_at)
```

The `session_id` uniquely identifies one conversation. It can be:
- A UUID generated at conversation start
- A combination of user_id + timestamp
- A JWT claim

### What a message looks like

```json
{"role": "user", "content": "How do I install the SDK?", "ts": 1716500000}
{"role": "assistant", "content": "Run pip install techbot-sdk", "ts": 1716500002}
```

### Why a List?

Lists let you:
- `RPUSH` — append to the right (chronological order)
- `LRANGE key -N -1` — fetch the last N messages
- `LTRIM key -100 -1` — cap at 100 messages (constant memory)

O(1) push, O(N) range fetch where N is the number of messages requested — perfect.

---

## TTL Strategy: Sliding Window

A session should expire after a period of **inactivity**, not a fixed time from creation. Reset the TTL on every interaction:

```python
def add_message(session_id, role, content):
    key = f"chat:{session_id}:messages"
    r.rpush(key, json.dumps({"role": role, "content": content}))
    r.ltrim(key, -100, -1)    # never store more than 100 messages
    r.expire(key, 86400)      # reset 24-hour inactivity timer
```

This means:
- Active users' sessions stay alive indefinitely (TTL keeps getting reset)
- Abandoned sessions expire 24 hours after the last message
- No manual cleanup needed

---

## Context Window Management

LLMs have a context limit. You cannot feed the entire conversation history into every prompt — it would overflow and become expensive.

**Pattern:** Send the last N turns, where N is chosen to fit within your model's context budget.

```python
def build_messages_for_llm(session_id, new_user_message, window=10):
    raw = r.lrange(f"chat:{session_id}:messages", -window * 2, -1)
    history = [json.loads(m) for m in raw]
    history.append({"role": "user", "content": new_user_message})
    return history
```

`-window * 2` because each "turn" is 2 messages (user + assistant).

---

## LangChain's `RedisChatMessageHistory`

LangChain provides a ready-made integration that handles all of the above automatically.

### How it works internally

When you create a `RedisChatMessageHistory` object:

1. It creates a **RediSearch index** named `idx:chat_history` (once, idempotent)
2. Each message is stored as a **JSON document** in Redis with a unique key: `chat:{session_id}:{ulid}`
3. The index has fields: `session_id` (TAG), `type` (TAG), `timestamp` (NUMERIC), `data` (TEXT)
4. When you call `.messages`, it runs a filter query: `@session_id:{your_session_id}` sorted by `timestamp`
5. TTL is set on each JSON document individually

### Why use LangChain's version vs raw redis-py?

| | Raw redis-py | RedisChatMessageHistory |
|---|---|---|
| Storage | List of JSON strings | JSON documents via RedisVL |
| Filtering | Only by session prefix | Full RediSearch filter queries |
| LangChain integration | Manual conversion | Native `BaseMessage` objects |
| Setup | 3 lines | 2 lines |
| Flexibility | Full control | Opinionated schema |

Use raw redis-py when you need full control over the schema. Use `RedisChatMessageHistory` when building with LangChain chains.

---

## Multi-Session Architecture

In production, one Redis instance handles thousands of concurrent sessions:

```
Redis keyspace:
  chat:user-001-session-a:messages   ← Alice's session
  chat:user-001-session-b:messages   ← Alice's second tab
  chat:user-002-session-x:messages   ← Bob's session
  chat:user-003-session-y:messages   ← Carol's session
```

Because each session has its own key, there is **zero contention** between users. Redis's single-threaded command processing means reads and writes for different sessions are automatically serialized and safe.

### Memory estimate

Assume:
- 100 messages per session (after LTRIM)
- 200 bytes per message average
- 10,000 concurrent active sessions

Memory: 100 × 200 bytes × 10,000 = **200 MB** — comfortably fits in a small Redis instance.

---

## What Comes Next

In `02_hands_on.ipynb` you will:
1. Connect to Redis and verify the connection
2. Build the `add_message` / `get_messages` functions from scratch
3. Implement sliding TTL
4. Use `RedisChatMessageHistory` with LangChain
5. Wire it into a simple chat loop (simulated LLM response)
6. Inspect the keys with RedisInsight GUI
