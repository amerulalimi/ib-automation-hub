"""
MT5 Candlestick Export API.
  POST /api/metadata  — symbols + timeframes (requires MT5 login).
  POST /api/export    — export OHLC to Excel (StreamingResponse).
"""
# pylint: disable=no-member  # MetaTrader5 is a binary extension; members exist at runtime
from datetime import datetime
from io import BytesIO
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models import MT5ExportRequest, MT5LoginRequest

router = APIRouter(prefix="/api", tags=["MT5 Export"])

# MT5 timeframe string -> constant (for frontend selection)
TIMEFRAME_STRINGS = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"]

TIMEFRAME_MAP: dict[str, Any] = {
    "M1": None,
    "M5": None,
    "M15": None,
    "M30": None,
    "H1": None,
    "H4": None,
    "D1": None,
    "W1": None,
    "MN1": None,
}


def _ensure_mt5() -> Any:
    """Import MT5 and initialize. Returns mt5 module or raises HTTPException."""
    try:
        import MetaTrader5 as mt5
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="MetaTrader5 package is not installed. Install with: pip install MetaTrader5",
        )
        
    if not mt5.initialize():
        err = mt5.last_error()
        msg = getattr(err, "message", str(err)) if err else "Unknown error"
        raise HTTPException(
            status_code=503,
            detail=f"MT5 initialization failed. Ensure MetaTrader 5 terminal is running. {msg}",
        )
    return mt5


def _ensure_mt5_logged_in(account_no: str, password: str, broker_server: str) -> Any:
    """Initialize MT5 and perform login. Raises 401 on invalid credentials."""
    mt5 = _ensure_mt5()
    try:
        login_int = int(account_no)
    except (TypeError, ValueError):
        mt5.shutdown()
        raise HTTPException(status_code=401, detail="Invalid MT5 account number.")

    ok = mt5.login(login=login_int, password=str(password), server=str(broker_server))
    if not ok or mt5.account_info() is None:
        mt5.shutdown()
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid MT5 login credentials or server.",
        )
    return mt5


def _build_timeframe_map() -> None:
    """Populate TIMEFRAME_MAP with mt5 constants (lazy, after import)."""
    try:
        import MetaTrader5 as mt5
        TIMEFRAME_MAP["M1"] = mt5.TIMEFRAME_M1
        TIMEFRAME_MAP["M5"] = mt5.TIMEFRAME_M5
        TIMEFRAME_MAP["M15"] = mt5.TIMEFRAME_M15
        TIMEFRAME_MAP["M30"] = mt5.TIMEFRAME_M30
        TIMEFRAME_MAP["H1"] = mt5.TIMEFRAME_H1
        TIMEFRAME_MAP["H4"] = mt5.TIMEFRAME_H4
        TIMEFRAME_MAP["D1"] = mt5.TIMEFRAME_D1
        TIMEFRAME_MAP["W1"] = mt5.TIMEFRAME_W1
        TIMEFRAME_MAP["MN1"] = mt5.TIMEFRAME_MN1
    except Exception:
        pass


@router.post("/metadata")
def get_metadata(payload: MT5LoginRequest) -> dict[str, Any]:
    """Fetch all available symbols + timeframe strings for a logged-in MT5 account."""
    mt5 = _ensure_mt5_logged_in(
        account_no=payload.account_no,
        password=payload.password,
        broker_server=payload.broker_server,
    )
    try:
        _build_timeframe_map()
        symbols = mt5.symbols_get()
        if symbols is None:
            raise HTTPException(
                status_code=502,
                detail="Failed to fetch symbols from MT5. Check connection or login.",
            )
        symbol_names = [s.name for s in symbols]
        return {
            "symbols": sorted(symbol_names),
            "timeframes": list(TIMEFRAME_STRINGS),
        }
    finally:
        mt5.shutdown()


@router.post("/export")
def export_candlesticks(payload: MT5ExportRequest) -> StreamingResponse:
    """
    Export OHLC candlestick data for given symbols and date range to Excel.
    Columns: Time, Symbol, Open, High, Low, Close.
    Requires valid MT5 login credentials.
    """
    mt5 = _ensure_mt5_logged_in(
        account_no=payload.account_no,
        password=payload.password,
        broker_server=payload.broker_server,
    )
    try:
        _build_timeframe_map()
        tf = TIMEFRAME_MAP.get(payload.timeframe)
        if tf is None:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timeframe. Use one of: {TIMEFRAME_STRINGS}",
            )
        try:
            raw_from = payload.date_from.strip().replace("Z", "+00:00")
            raw_to = payload.date_to.strip().replace("Z", "+00:00")
            if "T" not in raw_from:
                raw_from = raw_from + "T00:00:00"
            if "T" not in raw_to:
                raw_to = raw_to + "T23:59:59"
            date_from = datetime.fromisoformat(raw_from)
            date_to = datetime.fromisoformat(raw_to)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid date_from or date_to. Use ISO format (e.g. 2026-03-01T00:00:00).",
            )
        if not payload.symbols:
            raise HTTPException(status_code=400, detail="At least one symbol is required.")

        rows: list[dict[str, Any]] = []
        for symbol in payload.symbols:
            rates = mt5.copy_rates_range(symbol, tf, date_from, date_to)
            if rates is None or len(rates) == 0:
                continue
            for r in rates:
                rows.append({
                    "Time": pd.Timestamp(r["time"], unit="s").isoformat(),
                    "Symbol": symbol,
                    "Open": float(r["open"]),
                    "High": float(r["high"]),
                    "Low": float(r["low"]),
                    "Close": float(r["close"]),
                })
        if not rows:
            mt5.shutdown()
            raise HTTPException(
                status_code=404,
                detail="No OHLC data found for the given symbols and date range.",
            )

        df = pd.DataFrame(rows, columns=["Time", "Symbol", "Open", "High", "Low", "Close"])
        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="OHLC")
        buffer.seek(0)

        filename = f"MT5_Data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        mt5.shutdown()
