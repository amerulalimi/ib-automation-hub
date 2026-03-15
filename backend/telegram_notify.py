"""Telegram formatting and broadcast for Signal Bridge."""
import uuid
from datetime import datetime

from database import get_session, get_engine
from auth import decrypt_token


def format_signal_message(
    symbol: str, sig_type: str, entry: float, sl: float, tp: float, action: str
) -> str:
    dir_emoji = "📈" if sig_type.upper() == "BUY" else "📉"
    act_emoji = "🚀" if action.upper() == "OPEN" else "🔒"
    return (
        f"{act_emoji} *NEW SIGNAL: {sig_type.upper()} {symbol.upper()}*\n\n"
        f"Entry: `{entry:.5f}`\n"
        f"SL:    `{sl:.5f}`\n"
        f"TP:    `{tp:.5f}`\n\n"
        f"{dir_emoji} Action: *{action.upper()}*\n"
        f"⏱ Time: {datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S UTC')}"
    )


def send_telegram(bot_token: str, chat_id: str, text: str) -> dict:
    missing = []
    if not bot_token:
        missing.append("bot_token")
    if not chat_id:
        missing.append("chat_id")
    if not text:
        missing.append("text")
    if missing:
        return {
            "ok": False,
            "error": f"Missing required field(s): {', '.join(missing)}",
        }

    print(f"Sending telegram message to {chat_id}: {text} using bot token: {bot_token}")
    try:
        import httpx

        r = httpx.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
        data = r.json()
        if data.get("ok"):
            return {"ok": True}
        return {"ok": False, "error": data.get("description", "Unknown Telegram error")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def broadcast_signal(
    signal_id: str,
    symbol: str,
    sig_type: str,
    entry: float,
    sl: float,
    tp: float,
    action: str,
):
    """Send signal to all active Telegram channels and log results."""
    try:
        get_engine()
        db = get_session()
        from sqlalchemy import text as sqlt
        rows = db.execute(
            sqlt(
                "SELECT id, encrypted_bot_token, chat_id FROM channels WHERE is_active = TRUE"
            )
        ).fetchall()
        if not rows:
            return
        message = format_signal_message(symbol, sig_type, entry, sl, tp, action)
        for row in rows:
            ch_id, enc_token, chat_id = row
            try:
                bot_token = decrypt_token(enc_token)
                result = send_telegram(bot_token, chat_id, message)
            except Exception as e:
                result = {"ok": False, "error": str(e)}
            log_id = str(uuid.uuid4())
            db.execute(
                sqlt("""
                    INSERT INTO signal_logs (id, signal_id, channel_id, status, error, sent_at)
                    VALUES (:id, :sid, :cid, :status, :error, NOW())
                """),
                {
                    "id": log_id,
                    "sid": signal_id,
                    "cid": ch_id,
                    "status": "SENT" if result["ok"] else "FAILED",
                    "error": result.get("error"),
                },
            )
        db.commit()
        db.close()
    except Exception as e:
        print(f"[Broadcast] Error: {e}")
