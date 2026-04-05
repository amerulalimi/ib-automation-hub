"""Celery app for scheduled content posting (bypass Telegram scheduler limits)."""
import sys
from pathlib import Path

# Tasks import `database`, `auth`, etc. as top-level modules; worker cwd/sys.path may omit backend.
_BACKEND_DIR = str(Path(__file__).resolve().parent)
sys.path.insert(0, _BACKEND_DIR)

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

# prefork/billiard worker pool uses cross-process semaphores; on Windows this often raises
# PermissionError (WinError 5) on semlock. Use a single-process pool for local dev.
if sys.platform == "win32":
    app.conf.worker_pool = "solo"
    app.conf.worker_concurrency = 1
