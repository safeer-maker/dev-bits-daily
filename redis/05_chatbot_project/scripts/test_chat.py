"""
End-to-end test of TechBot.

Prerequisites:
  1. Redis Stack running on localhost:6379
  2. docs ingested: python scripts/ingest_docs.py
  3. Celery worker running: celery -A celery_app worker --queues=gpu --pool=solo
  4. FastAPI running: uvicorn main:api --port 9000

Run: python scripts/test_chat.py
"""

import time
import uuid
import httpx

API_URL = "http://localhost:9000"
SESSION_ID = f"test-{uuid.uuid4().hex[:8]}"


def chat(message: str) -> dict:
    """Submit a message and poll until response is ready."""
    print(f"\nUser: {message}")

    # Submit
    resp = httpx.post(f"{API_URL}/chat", json={"session_id": SESSION_ID, "message": message})
    resp.raise_for_status()
    task_id = resp.json()["task_id"]

    # Poll
    start = time.perf_counter()
    while True:
        result = httpx.get(f"{API_URL}/task/{task_id}").json()
        if result["status"] in ("SUCCESS", "FAILURE"):
            elapsed = (time.perf_counter() - start) * 1000
            source = result.get("source", "unknown")
            response = result.get("response", result.get("error", ""))
            print(f"Bot [{source}, {elapsed:.0f}ms]: {response}")
            return result
        time.sleep(0.3)


def main():
    print(f"TechBot End-to-End Test")
    print(f"Session ID: {SESSION_ID}")
    print("=" * 60)

    # Health check
    health = httpx.get(f"{API_URL}/health").json()
    print(f"Health: {health}")

    # Conversation 1: Installation
    chat("How do I install the TechBot SDK?")
    chat("What about on Windows?")  # Should remember we're talking about SDK

    # Conversation 2: Auth
    chat("How do I authenticate with the API?")
    chat("I forgot my password, how do I reset it?")

    # Conversation 3: Cache test — should hit semantic cache
    print("\n--- Testing semantic cache (these should be fast) ---")
    chat("What is the cost of TechBot?")
    time.sleep(0.5)
    chat("How much does TechBot Pro cost?")  # Should hit semantic cache

    # Show full history
    print("\n--- Full conversation history ---")
    history = httpx.get(f"{API_URL}/history/{SESSION_ID}").json()
    print(f"Total messages: {history['message_count']}")
    for msg in history["messages"]:
        role_label = "User" if msg["role"] == "user" else "Bot "
        print(f"  {role_label}: {msg['content'][:80]}...")

    # Cleanup
    httpx.delete(f"{API_URL}/history/{SESSION_ID}")
    print(f"\nSession {SESSION_ID} cleared.")


if __name__ == "__main__":
    main()
