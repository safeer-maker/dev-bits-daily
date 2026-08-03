"""
TechBot inference task.

Flow:
  1. Check Redis semantic cache → return if hit (< 5ms)
  2. Retrieve relevant docs from Redis vector store (RAG)
  3. Fetch recent chat history from Redis
  4. Build full prompt: system + RAG context + history + user message
  5. Call vLLM (or fake LLM if USE_FAKE_LLM=true)
  6. Store response in semantic cache
  7. Append user + assistant messages to chat history
  8. Return response
"""

import os
import numpy as np
from celery_app import app
from redisvl.extensions.llmcache import SemanticCache
from redisvl.index import SearchIndex
from redisvl.query import VectorQuery
from langchain_redis import RedisChatMessageHistory
from sentence_transformers import SentenceTransformer

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
VLLM_URL = os.getenv("VLLM_URL", "http://localhost:8000/v1/completions")
VLLM_MODEL = os.getenv("VLLM_MODEL", "meta-llama/Llama-3-8B-Instruct")
USE_FAKE_LLM = os.getenv("USE_FAKE_LLM", "true").lower() == "true"

# Load embedding model once per worker process (expensive to reload)
_embed_model = None

def get_embed_model():
    global _embed_model
    if _embed_model is None:
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embed_model


# Semantic cache (shared across all tasks in this worker process)
_semantic_cache = SemanticCache(
    name="vllm-cache",
    redis_url=REDIS_URL,
    distance_threshold=0.15,
    ttl=3600,
)

# RAG index reference (index must already exist — created by ingest_docs.py)
_rag_schema = {
    "index": {
        "name": "rag-docs",
        "prefix": "doc",
        "storage_type": "hash",
    },
    "fields": [
        {"name": "text",      "type": "text"},
        {"name": "source",    "type": "tag"},
        {"name": "category",  "type": "tag"},
        {"name": "page",      "type": "numeric"},
        {"name": "embedding", "type": "vector",
         "attrs": {
             "algorithm": "hnsw", "dims": 384,
             "distance_metric": "cosine", "datatype": "float32",
             "m": 16, "ef_construction": 200, "ef_runtime": 10
         }},
    ],
}

_rag_index = SearchIndex.from_dict(_rag_schema, redis_url=REDIS_URL)


def _retrieve_rag_context(user_message: str, top_k: int = 3) -> str:
    embed = get_embed_model()
    vec = embed.encode(user_message).astype(np.float32).tolist()
    query = VectorQuery(
        vector=vec,
        vector_field_name="embedding",
        return_fields=["text", "category"],
        num_results=top_k,
    )
    try:
        results = _rag_index.query(query)
        return "\n\n".join(r["text"] for r in results)
    except Exception:
        return ""


def _get_chat_history_text(session_id: str, last_n_turns: int = 5) -> str:
    history = RedisChatMessageHistory(
        session_id=session_id,
        redis_url=REDIS_URL,
        ttl=86400,
    )
    msgs = history.messages[-(last_n_turns * 2):]
    if not msgs:
        return ""
    lines = []
    for m in msgs:
        role = "User" if m.type == "human" else "Assistant"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


def _save_to_history(session_id: str, user_msg: str, ai_msg: str):
    history = RedisChatMessageHistory(
        session_id=session_id,
        redis_url=REDIS_URL,
        ttl=86400,
    )
    history.add_user_message(user_msg)
    history.add_ai_message(ai_msg)


def _call_vllm(prompt: str) -> str:
    import httpx
    resp = httpx.post(
        VLLM_URL,
        json={"model": VLLM_MODEL, "prompt": prompt, "max_tokens": 512},
        timeout=120.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["text"].strip()


def _fake_llm(prompt: str) -> str:
    # Extracts the last "User:" line and echoes a canned response
    lines = prompt.strip().split("\n")
    user_line = next((l for l in reversed(lines) if l.startswith("User:")), "User: Hello")
    question = user_line.replace("User:", "").strip()
    return (
        f"[TechBot Fake Response] You asked: '{question}'. "
        "Please connect vLLM and set USE_FAKE_LLM=false for real answers."
    )


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_inference(self, session_id: str, user_message: str):
    """
    Main TechBot inference Celery task.
    Returns a dict with 'source' (cache|vllm) and 'response' (text).
    """

    # Step 1: Semantic cache check
    cache_results = _semantic_cache.check(prompt=user_message)
    if cache_results:
        response_text = cache_results[0]["response"]
        _save_to_history(session_id, user_message, response_text)
        return {"source": "cache", "response": response_text}

    # Step 2: RAG retrieval
    rag_context = _retrieve_rag_context(user_message)

    # Step 3: Chat history
    history_text = _get_chat_history_text(session_id)

    # Step 4: Build full prompt
    context_section = f"\nRelevant documentation:\n{rag_context}\n" if rag_context else ""
    history_section = f"\nConversation so far:\n{history_text}\n" if history_text else ""

    full_prompt = (
        "System: You are TechBot, a helpful technical support assistant for TechCorp software. "
        "Answer accurately using the documentation provided. If the answer is not in the docs, say so."
        f"{context_section}"
        f"{history_section}"
        f"\nUser: {user_message}\nAssistant:"
    )

    # Step 5: LLM call
    try:
        if USE_FAKE_LLM:
            response_text = _fake_llm(full_prompt)
        else:
            response_text = _call_vllm(full_prompt)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)

    # Step 6: Store in semantic cache
    _semantic_cache.store(prompt=user_message, response=response_text)

    # Step 7: Persist to chat history
    _save_to_history(session_id, user_message, response_text)

    return {"source": "vllm" if not USE_FAKE_LLM else "fake_llm", "response": response_text}
