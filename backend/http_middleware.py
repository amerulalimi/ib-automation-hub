"""Trace id propagation and webhook body size limits."""
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from request_context import trace_id_var

# Max JSON body for signal ingestion (bytes)
SIGNAL_MAX_BODY_BYTES = 64 * 1024


class TraceIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        tid = request.headers.get("x-trace-id") or str(uuid.uuid4())
        trace_id_var.set(tid)
        response = await call_next(request)
        response.headers["x-trace-id"] = tid
        return response


class LimitUploadSizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self: "LimitUploadSizeMiddleware", request: Request, call_next):
        if request.method == "POST" and request.url.path.rstrip("/").endswith("/signal"):
            cl = request.headers.get("content-length")
            if cl is not None:
                try:
                    if int(cl) > SIGNAL_MAX_BODY_BYTES:
                        return JSONResponse(
                            status_code=413,
                            content={"detail": "Signal payload too large"},
                        )
                except ValueError:
                    pass
        return await call_next(request)
