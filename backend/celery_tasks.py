"""Celery tasks: send scheduled post, scan pending, and consume Telethon signal stream from Redis."""
from datetime import datetime, timezone
import logging
import redis
from celery_app import app
from config import REDIS_URL
from sqlalchemy import text as sqlt

logger = logging.getLogger(__name__)
STREAM_KEY = "telethon:signals"
LAST_ID_KEY = "telethon:signals:last_id"


def get_session():
    from database import get_engine, get_session as _get_session
    get_engine()
    return _get_session()


@app.task(bind=True)
def send_scheduled_post(self, scheduled_content_id: str):
    """Load scheduled_content and channel, send via Telegram, update status."""
    db = get_session()
    try:
        row = db.execute(
            sqlt("""
                SELECT sc.id, sc.channel_id, sc.content, sc.scheduled_at, sc.status,
                       c.encrypted_bot_token, c.chat_id
                FROM scheduled_contents sc
                JOIN channels c ON c.id = sc.channel_id
                WHERE sc.id = :id
            """),
            {"id": scheduled_content_id},
        ).fetchone()
        if not row:
            return {"ok": False, "error": "not_found"}
        sc_id, ch_id, content, scheduled_at, status, enc_token, chat_id = row
        if status != "pending":
            return {"ok": False, "error": "not_pending"}
        from auth import decrypt_token
        from telegram_notify import send_telegram
        try:
            bot_token = decrypt_token(enc_token)
            result = send_telegram(bot_token, chat_id, content)
        except Exception as e:
            db.execute(
                sqlt("""
                    UPDATE scheduled_contents SET status = 'failed', error = :err, sent_at = NOW(), updated_at = NOW() WHERE id = :id
                """),
                {"err": str(e), "id": sc_id},
            )
            db.commit()
            return {"ok": False, "error": str(e)}
        if result.get("ok"):
            db.execute(
                sqlt("""
                    UPDATE scheduled_contents SET status = 'sent', sent_at = NOW(), error = NULL, updated_at = NOW() WHERE id = :id
                """),
                {"id": sc_id},
            )
        else:
            db.execute(
                sqlt("""
                    UPDATE scheduled_contents SET status = 'failed', sent_at = NOW(), error = :err, updated_at = NOW() WHERE id = :id
                """),
                {"err": result.get("error", "Unknown"), "id": sc_id},
            )
        db.commit()
        return {"ok": result.get("ok", False), "error": result.get("error")}
    finally:
        db.close()


def get_redis_client():
    return redis.from_url(REDIS_URL, decode_responses=True)


@app.task(bind=True)
def process_telethon_signal_stream(self):
    """
    Worker: read new entries from Redis stream telethon:signals (from Telethon listener),
    process for audit/analytics. Run via Celery Beat every N seconds.
    """
    r = get_redis_client()
    try:
        last_id = r.get(LAST_ID_KEY) or "0-0"
        streams = r.xread(streams={STREAM_KEY: last_id}, count=100)
        if not streams:
            return {"processed": 0}
        processed = 0
        for stream_name, messages in streams:
            for msg_id, data in messages:
                try:
                    logger.info(
                        "Telethon signal from stream: id=%s source=%s symbol=%s type=%s",
                        msg_id,
                        data.get("source_channel_id"),
                        data.get("symbol"),
                        data.get("type"),
                    )
                    processed += 1
                except Exception as e:
                    logger.warning("process_telethon_signal_stream entry %s: %s", msg_id, e)
            if messages:
                last_id = messages[-1][0]
                r.set(LAST_ID_KEY, last_id)
        return {"processed": processed}
    except redis.RedisError as e:
        logger.warning("process_telethon_signal_stream Redis error: %s", e)
        raise self.retry(exc=e, countdown=60)
    finally:
        r.close()


@app.task
def scan_pending_scheduled():
    """Find pending scheduled_contents with scheduled_at <= now (+ 1 min buffer) and dispatch."""
    db = get_session()
    try:
        rows = db.execute(
            sqlt("""
                SELECT id FROM scheduled_contents
                WHERE status = 'pending' AND scheduled_at <= NOW() + INTERVAL '1 minute'
                ORDER BY scheduled_at
            """)
        ).fetchall()
        for (sid,) in rows:
            send_scheduled_post.delay(sid)
    finally:
        db.close()
