import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "techbot",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks.inference"],
)

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # ACK after completion so crashed workers re-queue tasks
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Must exceed your longest possible inference time
    broker_transport_options={"visibility_timeout": 7200},

    result_expires=86400,

    # GPU workers: one task at a time, no prefetch
    worker_prefetch_multiplier=1,

    # Restart worker process after N tasks to release memory
    worker_max_tasks_per_child=100,

    # Kill runaway tasks
    task_soft_time_limit=540,
    task_time_limit=600,

    task_routes={
        "tasks.inference.run_inference": {"queue": "gpu"},
    },
)
