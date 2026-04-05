"""Pytest defaults for backend tests."""
import os

os.environ.setdefault(
    "JWT_SECRET", "pytest-jwt-secret-value-must-be-long-for-hs256-ok!!"
)
os.environ.setdefault("MASTER_ENCRYPTION_KEY", "sixteen_char_key!")
os.environ.setdefault("SECRET_SIGNAL_KEY", "pytest-signal-key")
# Empty REDIS_URL → in-process rate limits (see limiter.py)
os.environ.setdefault("REDIS_URL", "")
