"""
TechBot FastAPI gateway.

Endpoints:
  POST /chat               — Submit a chat message, returns task_id immediately
  GET  /task/{task_id}     — Poll for result (client-side polling)
  GET  /history/{session}  — Get full chat history for a session
  DELETE /history/{session} — Clear a session's history
  GET  /health             — Health check
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from celery.result import AsyncResult
from langchain_redis import RedisChatMessageHistory
import os

from tasks.inference import run_inference

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

api = FastAPI(title="TechBot API", version="1.0.0")


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    task_id: str
    status: str


@api.post("/chat", response_model=ChatResponse)
async def submit_chat(request: ChatRequest):
    """
    Submit a user message. Returns immediately with a task_id.
    The actual inference happens asynchronously in a Celery worker.
    Poll GET /task/{task_id} to get the result.
    """
    task = run_inference.apply_async(
        args=[request.session_id, request.message],
        queue="gpu",
    )
    return ChatResponse(task_id=task.id, status="queued")


@api.get("/task/{task_id}")
async def get_task_result(task_id: str):
    """
    Poll this endpoint every 500ms until status is SUCCESS or FAILURE.
    """
    result = AsyncResult(task_id)

    if result.state == "PENDING":
        return {"status": "PENDING"}
    elif result.state == "STARTED":
        return {"status": "STARTED"}
    elif result.state == "SUCCESS":
        data = result.get()
        return {"status": "SUCCESS", **data}
    elif result.state == "FAILURE":
        return {"status": "FAILURE", "error": str(result.result)}
    else:
        return {"status": result.state}


@api.get("/history/{session_id}")
async def get_history(session_id: str):
    """Return the full conversation history for a session."""
    history = RedisChatMessageHistory(
        session_id=session_id,
        redis_url=REDIS_URL,
    )
    messages = [
        {"role": "user" if m.type == "human" else "assistant", "content": m.content}
        for m in history.messages
    ]
    return {"session_id": session_id, "message_count": len(messages), "messages": messages}


@api.delete("/history/{session_id}")
async def clear_history(session_id: str):
    """Clear all chat history for a session."""
    history = RedisChatMessageHistory(
        session_id=session_id,
        redis_url=REDIS_URL,
    )
    history.clear()
    return {"status": "cleared", "session_id": session_id}


@api.get("/health")
async def health():
    """Health check — verifies Redis connectivity."""
    import redis as redis_lib
    try:
        r = redis_lib.Redis.from_url(REDIS_URL)
        r.ping()
        return {"status": "ok", "redis": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Redis unavailable: {e}")


# Run with:
# uvicorn main:api --host 0.0.0.0 --port 9000 --reload
