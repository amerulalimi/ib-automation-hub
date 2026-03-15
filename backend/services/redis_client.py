import logging
import os
from typing import Optional

import redis.asyncio as redis


logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """
    Return a singleton Redis client instance.

    Uses REDIS_URL from environment, falling back to localhost.
    """
    global _redis_client
    if _redis_client is None:
        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        # decode_responses=True so we get str instead of bytes
        _redis_client = redis.from_url(url, decode_responses=True)
        logger.info("Connected Redis client using %s", url)
    return _redis_client

