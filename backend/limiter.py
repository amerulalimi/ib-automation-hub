import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Use Redis when REDIS_URL is set (shared limits across workers); else in-process memory.
_redis = os.getenv("REDIS_URL", "").strip()
_storage_uri = _redis if _redis else "memory://"

limiter = Limiter(key_func=get_remote_address, storage_uri=_storage_uri)
