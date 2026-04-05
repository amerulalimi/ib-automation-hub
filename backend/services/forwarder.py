"""Forward parsed signal from source_channel_id to destination channels with translation."""
import asyncio
import time
from typing import Any

from sqlalchemy import text as sqlt

from database import get_engine, get_session
from auth import decrypt_token
from telegram_notify import format_signal_message, send_telegram
from services.translation import translate_signal_message


def _get_forward_rules_and_destinations(source_channel_id: str) -> list[dict]:
    """Sync: load forward rules and destination channel rows (with target_language)."""
    get_engine()
    db = get_session()
    try:
        rows = db.execute(
            sqlt("""
                SELECT c.id, c.encrypted_bot_token, c.chat_id, c.target_language, c.ai_auto_reply
                FROM forward_rules fr
                JOIN channels c ON c.id = fr.destination_channel_id
                WHERE fr.source_channel_id = :sid AND c.is_active = TRUE
            """),
            {"sid": source_channel_id},
        ).fetchall()
        return [
            {
                "id": r[0], 
                "encrypted_bot_token": r[1], 
                "chat_id": r[2], 
                "target_language": r[3],
                "ai_auto_reply": r[4]
            }
            for r in rows
        ]
    finally:
        db.close()


async def forward_parsed_signal(
    source_channel_id: str,
    parsed: dict[str, Any],
) -> None:
    """
    Load destinations from forward_rules, format message, translate per target_language, send.
    """
    destinations = await asyncio.to_thread(
        _get_forward_rules_and_destinations, source_channel_id
    )
    if not destinations:
        return
    message_en = format_signal_message(
        parsed.get("symbol", "GOLD"),
        parsed.get("type", "BUY"),
        parsed["entry"],
        parsed["sl"],
        parsed["tp"],
        parsed.get("action", "OPEN"),
    )
    for dest in destinations:
        lang = dest.get("target_language") or "en"
        msg = await translate_signal_message(message_en, lang, dest["id"])
        try:
            bot_token = decrypt_token(dest["encrypted_bot_token"])
        except Exception:
            continue
        send_telegram(bot_token, dest["chat_id"], msg)


def _auto_reply_allowed(channel_id: str) -> bool:
    """Per-channel per-minute cap using Redis when available."""
    try:
        from config import REDIS_URL, AUTO_REPLY_MAX_PER_MINUTE
        import redis

        r = redis.from_url(REDIS_URL, decode_responses=True)
        try:
            window = int(time.time() // 60)
            key = f"autoreply:{channel_id}:{window}"
            n = r.incr(key)
            if n == 1:
                r.expire(key, 120)
            return n <= max(1, AUTO_REPLY_MAX_PER_MINUTE)
        finally:
            r.close()
    except Exception:
        return True


async def process_auto_reply(source_channel_id: str, text: str) -> None:
    """
    Handle auto-replies for non-signal messages (chatter/questions).
    Only for destinations with ai_auto_reply = True.
    """
    from services.ai_reply import generate_persona_reply

    destinations = await asyncio.to_thread(
        _get_forward_rules_and_destinations, source_channel_id
    )
    if not destinations:
        return

    for dest in destinations:
        if not dest.get("ai_auto_reply"):
            continue
        cid = dest["id"]
        allowed = await asyncio.to_thread(_auto_reply_allowed, cid)
        if not allowed:
            continue

        # Generate persona reply for this specific destination
        reply = await generate_persona_reply(text, cid)
        if not reply:
            continue
            
        try:
            bot_token = decrypt_token(dest["encrypted_bot_token"])
            send_telegram(bot_token, dest["chat_id"], reply)
        except Exception:
            continue
