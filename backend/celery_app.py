"""Celery app for scheduled content posting (bypass Telegram scheduler limits)."""
from celery import Celery
from config import REDIS_URL

app = Celery(
    "telegram_ib",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["celery_tasks"],
)
app.conf.update(
    timezone="UTC",
    enable_utc=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    beat_schedule={
        "scan-scheduled-contents": {
            "task": "celery_tasks.scan_pending_scheduled",
            "schedule": 60.0,
        },
        "process-telethon-signal-stream": {
            "task": "celery_tasks.process_telethon_signal_stream",
            "schedule": 15.0,
        },
    },
)
