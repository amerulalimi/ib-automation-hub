"""Per-request context for logging (trace id)."""
from contextvars import ContextVar

trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")
