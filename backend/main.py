"""
MT5 Report Generator + Signal Bridge Backend v5.0
==================================================
  POST /generate-report   — generate MT5 HTML from structured params
  Signal Bridge API       — /api/auth/login, /api/signal, /api/channels, etc.
  Telegram IB Automation — Signal Forwarder, Scheduler, AI/RAG
"""
import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import SENTRY_DSN
from http_middleware import LimitUploadSizeMiddleware, TraceIdMiddleware
from logging_setup import setup_logging
from limiter import limiter

if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        send_default_pii=False,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
    )

from routes.report import router as report_router
from routes.signal_bridge import router as signal_bridge_router
from routes.signal_forwarder import router as signal_forwarder_router
from routes.scheduler import router as scheduler_router
from routes.ai import router as ai_router
from routes.mt5_export import router as mt5_export_router
from routes.testmt5connection import router as test_mt5_router
from routes.signal_parser import router as signal_parser_router
from routes.admin_users import router as admin_users_router
from routes.ai_configs import router as ai_configs_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize logging first
    setup_logging()
    
    try:
        from services.telethon_client import start_listener
        asyncio.create_task(start_listener())
    except Exception:
        pass
    
    # Initialize database connection on startup
    try:
        from database import get_engine
        get_engine()
        print("[DB] Database initialized successfully.")
    except Exception as e:
        print(f"[DB] Database initialization failed: {e}")
        
    yield
    try:
        from services.telethon_client import stop_listener
        await stop_listener()
    except Exception:
        pass


app = FastAPI(
    title="MT5 Report Generator + Signal Bridge API",
    description="Backend untuk menjana HTML statement MT5 dan mengurus Signal Bridge",
    version="5.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(LimitUploadSizeMiddleware)
app.add_middleware(TraceIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(report_router)
app.include_router(signal_bridge_router)
app.include_router(signal_forwarder_router)
app.include_router(scheduler_router)
app.include_router(ai_router)
app.include_router(mt5_export_router)
app.include_router(test_mt5_router)
app.include_router(signal_parser_router)
app.include_router(admin_users_router)
app.include_router(ai_configs_router)
