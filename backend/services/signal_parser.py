"""Parse raw Telegram message text to extract Entry, SL, TP and optional symbol/type/action."""
import re
from typing import Any, Optional


def parse_signal_message(text: str) -> Optional[dict[str, Any]]:
    """
    Extract signal fields from message text using regex.
    Returns dict with entry, sl, tp, symbol, type, action or None if not parseable.
    """
    if not text or not text.strip():
        return None
    text = text.strip()
    # Common patterns: Entry: 2650.50, SL: 2640, TP: 2670, etc. (flexible spacing and case)
    entry_m = re.search(r"entry\s*[:\=]\s*([\d.]+)", text, re.I)
    sl_m = re.search(r"sl\s*[:\=]\s*([\d.]+)", text, re.I)
    tp_m = re.search(r"tp\s*[:\=]\s*([\d.]+)", text, re.I)
    stop_loss_m = re.search(r"stop\s*loss\s*[:\=]\s*([\d.]+)", text, re.I)
    take_profit_m = re.search(r"take\s*profit\s*[:\=]\s*([\d.]+)", text, re.I)
    entry = float(entry_m.group(1)) if entry_m else None
    sl = float(sl_m.group(1)) if sl_m else (float(stop_loss_m.group(1)) if stop_loss_m else None)
    tp = float(tp_m.group(1)) if tp_m else (float(take_profit_m.group(1)) if take_profit_m else None)
    if entry is None and sl is None and tp is None:
        return None
    if entry is None:
        entry = 0.0
    if sl is None:
        sl = 0.0
    if tp is None:
        tp = 0.0
    symbol_m = re.search(r"(?:symbol|pair|instrument)\s*[:\=]\s*(\S+)", text, re.I)
    symbol = (symbol_m.group(1).strip() if symbol_m else "GOLD")[:32]
    type_m = re.search(r"\b(buy|sell)\b", text, re.I)
    sig_type = (type_m.group(1).upper() if type_m else "BUY")
    action_m = re.search(r"\b(open|close)\b", text, re.I)
    action = (action_m.group(1).upper() if action_m else "OPEN")
    return {
        "entry": entry,
        "sl": sl,
        "tp": tp,
        "symbol": symbol,
        "type": sig_type,
        "action": action,
    }
