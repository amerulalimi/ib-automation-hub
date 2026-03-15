"""Telethon UserBot service: listen to source channels and trigger parser -> forwarder."""
import asyncio
import logging
from typing import Optional

from database import get_engine, get_session
from auth import decrypt_token
from services.signal_parser import parse_signal_message
from services.forwarder import forward_parsed_signal
from services.redis_client import get_redis

logger = logging.getLogger(__name__)

_clients: dict[str, "TelegramClient"] = {}
_running = False


def _load_accounts_and_source_channels() -> list[tuple[dict, list[dict]]]:
    """Sync: return list of (account_row, [source_channel_rows])."""
    from sqlalchemy import text as sqlt
    get_engine()
    db = get_session()
    try:
        accs = db.execute(
            sqlt("""
                SELECT id, name, api_id, api_hash, encrypted_session
                FROM telethon_accounts WHERE is_active = TRUE AND encrypted_session IS NOT NULL
            """)
        ).fetchall()
        result = []
        for a in accs:
            acc_id = a[0]
            sources = db.execute(
                sqlt("""
                    SELECT id, name, telegram_chat_id FROM source_channels
                    WHERE telethon_account_id = :aid AND is_active = TRUE
                """),
                {"aid": acc_id},
            ).fetchall()
            result.append(
                (
                    {"id": a[0], "name": a[1], "api_id": a[2], "api_hash": a[3], "encrypted_session": a[4]},
                    [{"id": s[0], "name": s[1], "telegram_chat_id": s[2]} for s in sources],
                )
            )
        return result
    finally:
        db.close()


async def _on_message(event, chat_to_source_id: dict[str, str]):
    """Handle NewMessage: parse, cache to Redis, then forward."""
    try:
        chat_id_str = str(event.chat_id)
        source_channel_id = chat_to_source_id.get(chat_id_str)
        if not source_channel_id:
            return
        text = event.message.text or ""
        parsed = parse_signal_message(text)
        if not parsed:
            return

        # Cache parsed signal into Redis stream for background workers / auditing
        try:
            redis = get_redis()
            await redis.xadd(
                "telethon:signals",
                {
                    "source_channel_id": source_channel_id,
                    "symbol": parsed.get("symbol", ""),
                    "type": parsed.get("type", ""),
                    "action": parsed.get("action", ""),
                    "entry": str(parsed.get("entry", "")),
                    "sl": str(parsed.get("sl", "")),
                    "tp": str(parsed.get("tp", "")),
                    "raw": text,
                },
            )
        except Exception as e:  # Redis failure must not break live forwarding
            logger.warning("Failed to cache signal in Redis: %s", e)

        await forward_parsed_signal(source_channel_id, parsed)
    except Exception as e:
        logger.exception("Forwarder on_message error: %s", e)


async def start_listener() -> None:
    """Start Telethon clients for all active accounts and subscribe to source channels."""
    global _clients, _running
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        from telethon import events
    except ImportError:
        logger.warning("Telethon not installed; signal forwarder listener disabled.")
        return
    try:
        data = await asyncio.to_thread(_load_accounts_and_source_channels)
    except Exception as e:
        # DB might be down/misconfigured; don't crash the whole app on startup.
        logger.warning("Telethon listener not started (DB unavailable): %s", e)
        return
    for account, sources in data:
        if not sources:
            continue
        acc_id = account["id"]
        if acc_id in _clients:
            continue
        try:
            session_str = decrypt_token(account["encrypted_session"])
            client = TelegramClient(
                StringSession(session_str),
                account["api_id"],
                account["api_hash"],
            )
            await client.start()
            chat_to_source_id: dict[str, str] = {}
            chat_peers = []
            for s in sources:
                try:
                    entity = await client.get_entity(s["telegram_chat_id"])
                    chat_id_str = str(entity.id)
                    chat_to_source_id[chat_id_str] = s["id"]
                    chat_peers.append(entity)
                except Exception as e:
                    logger.warning("Could not resolve chat %s: %s", s["telegram_chat_id"], e)
            if not chat_peers:
                continue

            async def handler(ev, m=chat_to_source_id):
                await _on_message(ev, m)

            client.add_event_handler(handler, events.NewMessage(chats=chat_peers))
            _clients[acc_id] = client
            logger.info("Telethon listener started for account %s", acc_id)
        except Exception as e:
            logger.exception("Failed to start Telethon for account %s: %s", acc_id, e)
    _running = True


async def stop_listener() -> None:
    """Disconnect all Telethon clients."""
    global _clients, _running
    for acc_id, client in list(_clients.items()):
        try:
            await client.disconnect()
        except Exception as e:
            logger.warning("Disconnect %s: %s", acc_id, e)
    _clients.clear()
    _running = False


def is_running() -> bool:
    return _running
