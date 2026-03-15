"""Report generation endpoints: /, /health, /generate-report."""
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from models import GenerateReportRequest, HealthResponse
from config import OPENAI_API_KEY
from report_builder import build_html
from dummy_trades import generate_dummy_trades

router = APIRouter(tags=["Report"])


@router.get("/", response_model=HealthResponse)
def root():
    return {"status": "ok", "message": "MT5 Report Generator API v3 is running"}


@router.get("/health", response_model=HealthResponse)
def health_check():
    from config import DATABASE_URL
    from database import get_engine

    ai_status = (
        "configured"
        if (OPENAI_API_KEY and OPENAI_API_KEY != "your_openai_api_key_here")
        else "not_configured (fallback mode)"
    )
    db_status = "not_configured"
    if DATABASE_URL:
        try:
            engine = get_engine()
            if engine is not None:
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                db_status = "connected"
            else:
                db_status = "unavailable"
        except Exception:
            db_status = "error"
    return {
        "status": "ok" if db_status in ("not_configured", "connected") else "degraded",
        "message": f"Server healthy | DB: {db_status} | OpenAI: {ai_status}",
    }


def _parse_dates(payload: GenerateReportRequest):
    try:
        date_to_dt = (
            datetime.strptime(payload.date_to, "%Y-%m-%d") if payload.date_to else datetime.now()
        )
    except ValueError:
        date_to_dt = datetime.now()
    try:
        date_from_dt = (
            datetime.strptime(payload.date_from, "%Y-%m-%d")
            if payload.date_from
            else date_to_dt - timedelta(days=30)
        )
    except ValueError:
        date_from_dt = date_to_dt - timedelta(days=30)
    if date_from_dt >= date_to_dt:
        date_from_dt = date_to_dt - timedelta(days=1)
    return date_from_dt, date_to_dt


@router.post("/generate-report")
def generate_report(payload: GenerateReportRequest):
    """Generate MT5-style HTML report from structured params (dummy or live MT5)."""
    now_str = datetime.now().strftime("%Y.%m.%d %H:%M")
    date_from_dt, date_to_dt = _parse_dates(payload)
    target_profit = round(payload.start_deposit * payload.profit_percent / 100, 2)
    days_back = max(1, (date_to_dt - date_from_dt).days)

    account_info = {
        "name": f"Trader ({payload.broker})",
        "account": payload.account_no,
        "currency": "USD",
        "server": payload.broker,
        "type": "real",
        "hedge": "Hedge",
        "company": payload.broker,
        "leverage": "1:100",
        "report_date": now_str,
    }

    params = {
        "symbol": payload.symbol or "Pelbagai",
        "profit_percent": payload.profit_percent,
        "target_profit": target_profit,
        "start_deposit": payload.start_deposit,
        "max_rows": payload.max_rows,
        "days_back": days_back,
        "date_from": date_from_dt.strftime("%Y-%m-%d"),
        "date_to": date_to_dt.strftime("%Y-%m-%d"),
        "has_withdrawal": payload.has_withdrawal,
        "withdrawal_amount": payload.withdrawal_amount if payload.has_withdrawal else 0.0,
        "is_dummy": payload.is_dummy,
    }

    if payload.is_dummy:
        trades = generate_dummy_trades(
            count=payload.max_rows,
            symbol_filter=payload.symbol,
            target_profit=target_profit,
            date_from_dt=date_from_dt,
            date_to_dt=date_to_dt,
        )
        html = build_html(trades, account_info, payload.start_deposit)
        return {"status": "ok", "source": "dummy", "params": params, "trades": trades, "html": html}

    # Live MT5
    try:
        import MetaTrader5 as mt5
        from datetime import timezone

        if not mt5.initialize():
            raise HTTPException(
                status_code=500,
                detail=(
                    "MT5 initialization gagal. "
                    "Pastikan MetaTrader5 terminal sedang dibuka dan anda sudah log masuk."
                ),
            )
        info = mt5.account_info()
        if info is None:
            mt5.shutdown()
            raise HTTPException(
                status_code=401,
                detail=(
                    "Tidak dapat mendapatkan maklumat akaun MT5. "
                    "Sila buka MetaTrader5 terminal dan log masuk ke akaun anda terlebih dahulu."
                ),
            )
        account_info.update({
            "name": info.name,
            "account": str(info.login),
            "server": info.server,
            "company": getattr(info, "company", payload.broker),
        })
        dt_from_utc = date_from_dt.replace(tzinfo=timezone.utc)
        dt_to_utc = date_to_dt.replace(tzinfo=timezone.utc)
        deals = mt5.history_deals_get(dt_from_utc, dt_to_utc)
        mt5.shutdown()

        trades = []
        if deals and len(deals) > 0:
            import pandas as pd
            df = pd.DataFrame(list(deals), columns=deals[0]._asdict().keys())
            df = df[df["entry"] == 1].reset_index(drop=True)
            for _, row in df.iterrows():
                trades.append({
                    "ticket": int(row["ticket"]),
                    "open_time": str(row["time"]),
                    "symbol": str(row["symbol"]),
                    "type": "buy" if int(row["type"]) == 0 else "sell",
                    "volume": float(row["volume"]),
                    "open_price": float(row["price"]),
                    "sl": 0.0,
                    "tp": 0.0,
                    "close_time": str(row["time"]),
                    "close_price": float(row["price"]),
                    "commission": float(row.get("commission", 0)),
                    "swap": float(row.get("swap", 0)),
                    "profit": float(row["profit"]),
                })
        if payload.symbol:
            trades = [t for t in trades if t["symbol"].upper() == payload.symbol.upper()]
        trades = trades[: payload.max_rows]
        initial_balance = float(info.balance) - sum(t["profit"] for t in trades)
        html = build_html(trades, account_info, initial_balance)
        return {"status": "ok", "source": "mt5_live", "params": params, "trades": trades, "html": html}

    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail=(
                "Package MetaTrader5 tidak tersedia pada sistem ini. "
                "Aktifkan mod Demo untuk jana data contoh."
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ralat tidak dijangka semasa membaca data MT5: {str(exc)}",
        )
