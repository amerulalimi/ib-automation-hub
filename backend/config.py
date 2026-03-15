"""App configuration from environment."""
import os
from dotenv import load_dotenv

load_dotenv()

# Optional: used in health check only
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

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
