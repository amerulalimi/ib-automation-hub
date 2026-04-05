"""App configuration from environment."""
import os
from dotenv import load_dotenv

load_dotenv()

# Database (optional)
DATABASE_URL = os.getenv("DATABASE_URL")

# Auth
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("NEXTAUTH_SECRET", "")
MASTER_ENCRYPTION_KEY = os.getenv("MASTER_ENCRYPTION_KEY", "")

# Dashboard login (optional: only for initial seed; after first run users are in DB)
DASHBOARD_EMAIL = os.getenv("DASHBOARD_EMAIL", "")
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "")

# Signal Bridge
SECRET_SIGNAL_KEY = os.getenv("SECRET_SIGNAL_KEY", "")

# Telegram IB Automation
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Celery permanent-failure alerts (optional Telegram bot)
CELERY_ALERT_BOT_TOKEN = os.getenv("CELERY_ALERT_BOT_TOKEN", "")
CELERY_ALERT_CHAT_ID = os.getenv("CELERY_ALERT_CHAT_ID", "")

# Observability
SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()

# S3-compatible storage (optional — scheduled post photo uploads: AWS S3, MinIO, R2, etc.)
AWS_ACCESS_KEY_ID = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
AWS_SECRET_ACCESS_KEY = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
AWS_REGION = (os.getenv("AWS_REGION") or "us-east-1").strip()
S3_SCHEDULED_MEDIA_BUCKET = (os.getenv("S3_SCHEDULED_MEDIA_BUCKET") or "").strip()
S3_ENDPOINT_URL = (os.getenv("S3_ENDPOINT_URL") or "").strip().rstrip("/")
S3_PUBLIC_BASE_URL = (os.getenv("S3_PUBLIC_BASE_URL") or "").strip().rstrip("/")

# Auto-reply rate limit per destination channel (replies per minute)
AUTO_REPLY_MAX_PER_MINUTE = int(os.getenv("AUTO_REPLY_MAX_PER_MINUTE", "20"))
