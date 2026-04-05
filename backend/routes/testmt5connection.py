"""
Simple MT5 connection test endpoint for Postman.

POST /api/testmt5connection
Body: { "account_no": "12345678", "password": "your_password", "broker_server": "MetaQuotes-Demo" }
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Body

from models import MT5LoginRequest

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None  # type: ignore[misc, assignment]


router = APIRouter(prefix="/api", tags=["MT5 Test"])


def _validate_body(body: MT5LoginRequest | None) -> MT5LoginRequest:
    """Reject null/empty body or empty required fields; return 400 with clear message."""
    if body is None:
        raise HTTPException(
            status_code=400,
            detail="Request body is required. Send JSON: { \"account_no\": \"...\", \"password\": \"...\", \"broker_server\": \"...\" }",
        )
    account = (body.account_no or "").strip()
    password = (body.password or "").strip()
    server = (body.broker_server or "").strip()
    if not account:
        raise HTTPException(
            status_code=400,
            detail="Request body must include non-empty 'account_no'.",
        )
    if not password:
        raise HTTPException(
            status_code=400,
            detail="Request body must include non-empty 'password'.",
        )
    if not server:
        raise HTTPException(
            status_code=400,
            detail="Request body must include non-empty 'broker_server'.",
        )
    return body


@router.post("/testmt5connection")
def test_mt5_connection(
    body: MT5LoginRequest | None = Body(None, description="MT5 login: account_no, password, broker_server"),
) -> dict[str, Any]:
    """
    Try to initialize and log into MT5, then return basic connection info.
    Requires JSON body with account_no, password, broker_server (all non-empty).
    """
    body = _validate_body(body)

    if mt5 is None:
        raise HTTPException(
            status_code=501,
            detail="MetaTrader5 is not available on this platform (install on Windows with MT5 terminal).",
        )

    try:
        login_int = int(body.account_no.strip())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="'account_no' must be a valid number.",
        )

    if not mt5.initialize(login=login_int, password=body.password, server=body.broker_server):
        err = mt5.last_error()
        code = getattr(err, "code", None)
        message = getattr(err, "message", str(err)) if err else "Unknown error"
        mt5.shutdown()
        raise HTTPException(
            status_code=503,
            detail=f"MT5 initialize/login failed: {code} {message}",
        )

    terminal_info = mt5.terminal_info()
    version = mt5.version()
    mt5.shutdown()

    return {
        "status": "ok",
        "terminal_info": terminal_info._asdict() if terminal_info is not None else None,
        "version": version,
    }