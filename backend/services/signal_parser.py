"""
AI Signal Parser Service
Extracts trading signal details (Pair, Entry, SL, TP) from raw text.
Uses GPT-4o-mini with Regex fallback and hybrid mapping for Gold.
"""
import asyncio
import re
import uuid
from typing import Any, List, Optional

import instructor
from pydantic import BaseModel, Field
from sqlalchemy import select
from database import get_session, UsageLog, DashboardUser

# ── Pydantic Schema ──────────────────────────────────────────────────────────

class ParsedSignal(BaseModel):
    """Structured result for a trading signal."""
    is_signal: bool = Field(description="True if the message is a trading signal (Buy/Sell with target prices)")
    pair: str = Field("", description="Trading pair like XAUUSD, EURUSD, GBPUSD")
    order_type: str = Field("", description="Type of signal: BUY or SELL")
    entry: float = Field(0.0, description="Entry price to open the trade")
    sl: float = Field(0.0, description="Stop Loss price")
    tp: List[float] = Field(default_factory=list, description="List of Take Profit prices (TP1, TP2, etc.)")

# ── Hybrid Mapping & Standardization ─────────────────────────────────────────

def _standardize_pair(pair: str) -> str:
    """
    Standardize the trading pair for MT5 compatibility.
    Hardcode Priority: 'Gold'/'XAU' -> 'XAUUSD'.
    """
    if not pair:
        return ""
    
    p = pair.upper().strip()
    # Hardcode mapping for Gold as requested
    if p in ["GOLD", "XAU", "XAUUSD_IB"]:
        return "XAUUSD"
    
    # Standard cleanup (remove common suffixes/prefixes if any)
    # Most Forex pairs like GBPUSD are already standard in MT5
    return p

# ── Usage Logging ────────────────────────────────────────────────────────────

def _record_usage(action: str, details: dict):
    """Record activity to UsageLog table."""
    try:
        session = get_session()
        try:
            # Find an admin user to associate with the log
            admin = session.scalar(select(DashboardUser).where(DashboardUser.role == "admin").limit(1))
            user_id = admin.id if admin else None
            
            log = UsageLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                action_type=action,
                details=details
            )
            session.add(log)
            session.commit()
        finally:
            session.close()
    except Exception as e:
        # Don't let logging fail the main process
        print(f"[SignalParser] Logging failed: {e}")

# ── Fallback Mechanism (Regex) ───────────────────────────────────────────────

def regex_fallback_parser(text: str) -> Optional[dict]:
    """
    Simple Regex parser as a backup for AI failure.
    Detects BUY/SELL keywords and nearby numbers for Entry, SL, TP.
    """
    if not text:
        return None
        
    text_upper = text.upper()
    
    # Check for BUY/SELL
    order_type = None
    if "BUY" in text_upper:
        order_type = "BUY"
    elif "SELL" in text_upper:
        order_type = "SELL"
    
    if not order_type:
        return None # Not a signal if no order type found in fallback
        
    # Extract numbers
    # Pattern: Look for keywords and numbers after them
    entry_match = re.search(r"ENTRY\s*[:\=]?\s*([\d.]+)", text_upper)
    sl_match = re.search(r"SL\s*[:\=]?\s*([\d.]+)", text_upper)
    tp_match = re.findall(r"TP\s*[:\=]?\s*([\d.]+)", text_upper)
    
    # Try generic price extraction if specific keywords are missing
    # (Matches any 4-5 digit number or decimals)
    prices = re.findall(r"(\d+\.\d+|\d{4,5})", text_upper)
    
    entry = float(entry_match.group(1)) if entry_match else (float(prices[0]) if prices else 0.0)
    sl = float(sl_match.group(1)) if sl_match else 0.0
    tp_list = [float(t) for t in tp_match] if tp_match else []
    
    # Attempt to detect pair (very basic)
    pair = "XAUUSD" # Default logic if not found
    pair_match = re.search(r"(XAUUSD|GOLD|GBPUSD|EURUSD|USDJPY|GBP|EUR|JPY)", text_upper)
    if pair_match:
        pair = _standardize_pair(pair_match.group(1))
        
    return {
        "is_signal": True,
        "pair": pair,
        "order_type": order_type,
        "entry": entry,
        "sl": sl,
        "tp": tp_list if tp_list else [0.0],
        "method": "regex_fallback"
    }

# ── Main Service Logic ───────────────────────────────────────────────────────

def _parse_signal_ai_sync(text: str, channel_id: str) -> Optional[dict]:
    """Sync Instructor + OpenAI call; uses destination channel's stored API credentials."""
    try:
        from database import get_engine, get_session
        from services.openai_credentials import build_openai_client_for_channel

        get_engine()
        db = get_session()
        try:
            client = build_openai_client_for_channel(db, channel_id)
        finally:
            db.close()

        wrapped = instructor.from_openai(client)

        result: ParsedSignal = wrapped.chat.completions.create(
            model="gpt-4o-mini",
            response_model=ParsedSignal,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional Forex signal parser. "
                        "Extract trading signals even if the format is irregular. "
                        "Standardize the pair for MT5 (e.g., Gold -> XAUUSD, GU -> GBPUSD, UJ -> USDJPY). "
                        "If the text is NOT a signal (market update, chatter, news), set is_signal to False."
                    ),
                },
                {"role": "user", "content": text},
            ],
            max_retries=2,
        )

        _record_usage("SIGNAL_PARSING", {
            "status": "success",
            "method": "ai",
            "is_signal": result.is_signal,
            "pair_found": result.pair,
            "text_snippet": text[:100],
        })

        if result.is_signal:
            final_pair = _standardize_pair(result.pair)
            return {
                "is_signal": True,
                "pair": final_pair,
                "order_type": result.order_type.upper(),
                "entry": result.entry,
                "sl": result.sl,
                "tp": result.tp if result.tp else [0.0],
                "method": "ai_parser",
            }
        return None

    except Exception as e:
        print(f"[SignalParser] AI Error: {e}")
        _record_usage("SIGNAL_PARSING", {
            "status": "error",
            "method": "ai_attempt",
            "error": str(e),
        })
        return None


async def parse_signal(
    text: str, credentials_channel_id: Optional[str] = None
) -> Optional[dict]:
    """
    Analyzes message text to detect and extract signal data.
    Uses GPT-4o-mini via Instructor when credentials_channel_id is set (e.g. Telethon forward path).
    """
    if not text or not text.strip():
        return None

    if credentials_channel_id:
        ai_res = await asyncio.to_thread(
            _parse_signal_ai_sync, text, credentials_channel_id
        )
        if ai_res is not None:
            return ai_res

    fallback_res = regex_fallback_parser(text)
    if fallback_res:
        _record_usage("SIGNAL_PARSING", {
            "status": "success",
            "method": "regex_fallback",
            "pair_found": fallback_res["pair"]
        })
    return fallback_res

