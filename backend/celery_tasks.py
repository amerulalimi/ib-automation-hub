"""Celery tasks: send scheduled post, scan pending, and consume Telethon signal stream from Redis."""
import json
import sys
import time
from pathlib import Path

# Ensure backend package root is on sys.path before any sibling imports (Windows / Celery import order).
_CT_ROOT = str(Path(__file__).resolve().parent)
sys.path.insert(0, _CT_ROOT)

_SESSION_PATH_READY = False

import logging
import redis
from celery_app import app
from config import REDIS_URL
from sqlalchemy import text as sqlt

logger = logging.getLogger(__name__)
STREAM_KEY = "telethon:signals"
LAST_ID_KEY = "telethon:signals:last_id"
_DEBUG_LOG_PATH = Path(__file__).resolve().parent.parent / "debug-aa8423.log"


def _agent_debug_log(payload: dict) -> None:
    # #region agent log
    try:
        line = json.dumps(
            {"sessionId": "aa8423", "timestamp": int(time.time() * 1000), **payload},
            ensure_ascii=False,
        )
        with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    # #endregion


def _alert_task_failure(task_name: str, detail: str) -> None:
    from config import CELERY_ALERT_BOT_TOKEN, CELERY_ALERT_CHAT_ID

    if not CELERY_ALERT_BOT_TOKEN or not CELERY_ALERT_CHAT_ID:
        return
    try:
        from telegram_notify import send_telegram

        msg = f"⚠️ *Celery task failed permanently*\n`{task_name}`\n```{detail[:800]}```"
        send_telegram(CELERY_ALERT_BOT_TOKEN, CELERY_ALERT_CHAT_ID, msg)
    except Exception as e:
        logger.warning("Celery failure alert could not be sent: %s", e)


def get_session():
    global _SESSION_PATH_READY
    if not _SESSION_PATH_READY:
        sys.path.insert(0, _CT_ROOT)
        _SESSION_PATH_READY = True
    from database import get_engine, get_session as _get_session
    get_engine()
    return _get_session()


@app.task(bind=True, max_retries=3)
def send_scheduled_post(self, scheduled_content_id: str):
    """Load scheduled_content and channel, send via Telegram, update status."""
    import uuid

    from auth import decrypt_token
    from telegram_notify import send_telegram

    db = get_session()
    try:
        row = db.execute(
            sqlt("""
                SELECT sc.id, sc.channel_id, sc.content, sc.post_kind, sc.post_meta, sc.scheduled_at, sc.status,
                       c.encrypted_bot_token, c.chat_id
                FROM scheduled_contents sc
                JOIN channels c ON c.id = sc.channel_id
                WHERE sc.id = :id
            """),
            {"id": scheduled_content_id},
        ).fetchone()
        if not row:
            return {"ok": False, "error": "not_found"}
        sc_id, ch_id, content, post_kind, post_meta, scheduled_at, status, enc_token, chat_id = row
        if status != "pending":
            return {"ok": False, "error": "not_pending"}

        if isinstance(post_meta, str):
            try:
                meta = json.loads(post_meta)
            except json.JSONDecodeError:
                meta = {}
        elif isinstance(post_meta, dict):
            meta = post_meta
        else:
            meta = {}
        kind = (post_kind or "text").strip() or "text"
        meta_keys = sorted(meta.keys()) if isinstance(meta, dict) else []
        opts_len = len(meta.get("options") or []) if isinstance(meta, dict) else 0
        has_q = bool((meta.get("question") or "").strip()) if isinstance(meta, dict) else False
        photo_u = (meta.get("photo_url") or "")[:24] if isinstance(meta, dict) else ""
        _agent_debug_log(
            {
                "hypothesisId": "H1",
                "location": "celery_tasks.send_scheduled_post:pre_branch",
                "message": "loaded_row",
                "data": {
                    "sc_id": sc_id,
                    "post_kind_raw": kind,
                    "post_kind_type": type(post_kind).__name__ if post_kind is not None else "NoneType",
                    "meta_keys": meta_keys,
                    "poll_has_question": has_q,
                    "poll_options_len": opts_len,
                    "photo_url_prefix": photo_u,
                    "content_len": len(content or ""),
                    "chat_id_type": type(chat_id).__name__,
                },
                "runId": "debug1",
            }
        )

        try:
            bot_token = decrypt_token(enc_token)
            branch = "text"
            if kind == "photo":
                branch = "photo"
            elif kind == "poll":
                branch = "poll"
            _agent_debug_log(
                {
                    "hypothesisId": "H2",
                    "location": "celery_tasks.send_scheduled_post:branch",
                    "message": "telegram_branch",
                    "data": {"sc_id": sc_id, "branch": branch, "kind_compared": kind},
                    "runId": "debug1",
                }
            )
            if kind == "photo":
                from telegram_notify import send_telegram_photo

                url = (meta.get("photo_url") or "").strip()
                if not url.startswith("https://"):
                    raise ValueError("invalid or missing photo_url for scheduled photo post")
                result = send_telegram_photo(bot_token, chat_id, url, content or "")
            elif kind == "poll":
                from telegram_notify import send_telegram_poll

                q = (meta.get("question") or "").strip()
                opts = meta.get("options") or []
                if not q or not isinstance(opts, list) or len(opts) < 2:
                    raise ValueError("invalid poll metadata on scheduled post")
                result = send_telegram_poll(
                    bot_token,
                    chat_id,
                    q,
                    [str(o) for o in opts],
                    bool(meta.get("is_anonymous", True)),
                    bool(meta.get("allows_multiple_answers", False)),
                )
            else:
                result = send_telegram(bot_token, chat_id, content)
            _agent_debug_log(
                {
                    "hypothesisId": "H3",
                    "location": "celery_tasks.send_scheduled_post:after_send",
                    "message": "telegram_result",
                    "data": {
                        "sc_id": sc_id,
                        "branch": branch,
                        "ok": bool(result.get("ok")),
                        "err": (result.get("error") or "")[:300],
                    },
                    "runId": "debug1",
                }
            )
        except Exception as e:
            _agent_debug_log(
                {
                    "hypothesisId": "H5",
                    "location": "celery_tasks.send_scheduled_post:except",
                    "message": "send_exception",
                    "data": {
                        "sc_id": sc_id,
                        "exc_type": type(e).__name__,
                        "exc": str(e)[:400],
                    },
                    "runId": "debug1",
                }
            )
            if self.request.retries < self.max_retries:
                raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
            db.execute(
                sqlt("""
                    UPDATE scheduled_contents SET status = 'failed', error = :err, sent_at = NOW(), updated_at = NOW() WHERE id = :id
                """),
                {"err": str(e), "id": sc_id},
            )
            db.commit()
            _alert_task_failure("send_scheduled_post", f"id={sc_id} err={e}")
            return {"ok": False, "error": str(e)}

        if result.get("ok"):
            db.execute(
                sqlt("""
                    UPDATE scheduled_contents SET status = 'sent', sent_at = NOW(), error = NULL, updated_at = NOW() WHERE id = :id
                """),
                {"id": sc_id},
            )
            db.execute(
                sqlt("""
                    INSERT INTO usage_logs (id, user_id, action_type, details, timestamp)
                    VALUES (:log_id, NULL, 'send_scheduled_post', :details, NOW())
                """),
                {
                    "log_id": str(uuid.uuid4()),
                    "details": json.dumps({"channel_id": ch_id, "scheduled_content_id": sc_id}),
                },
            )
            db.commit()
            return {"ok": True, "error": None}

        err = result.get("error", "Unknown")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=RuntimeError(err), countdown=60 * (2 ** self.request.retries))
        db.execute(
            sqlt("""
                UPDATE scheduled_contents SET status = 'failed', sent_at = NOW(), error = :err, updated_at = NOW() WHERE id = :id
            """),
            {"err": err, "id": sc_id},
        )
        db.commit()
        _alert_task_failure("send_scheduled_post", f"id={sc_id} telegram={err}")
        return {"ok": False, "error": err}
    finally:
        db.close()


def get_redis_client():
    return redis.from_url(REDIS_URL, decode_responses=True)


@app.task(bind=True, max_retries=3)
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
