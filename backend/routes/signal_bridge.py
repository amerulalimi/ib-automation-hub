"""Signal Bridge API: auth, signals, channels."""
import json
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends, Response
from sqlalchemy import text as sqlt

from config import SECRET_SIGNAL_KEY
from models import LoginRequest, MT5SignalRequest, ChannelCreateRequest, ChannelUpdateRequest
from auth import (
    AUTH_COOKIE_NAME,
    JWT_EXPIRE_HOURS,
    create_access_token,
    require_auth,
    encrypt_token,
    decrypt_token,
    token_hint,
)
from database import get_engine, get_session
from telegram_notify import broadcast_signal, send_telegram

router = APIRouter(prefix="/api", tags=["Signal Bridge"])


@router.post("/auth/login")
def login(body: LoginRequest, response: Response):
    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt("SELECT id, password_hash FROM dashboard_users WHERE email = :email"),
            {"email": body.email.strip()},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        import bcrypt
        hash_bytes = row[1].encode("utf-8") if isinstance(row[1], str) else row[1]
        if not bcrypt.checkpw(body.password.encode("utf-8"), hash_bytes):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_access_token(body.email)
        response.set_cookie(
            key=AUTH_COOKIE_NAME,
            value=token,
            httponly=True,
            secure=False,  # localhost/dev
            samesite="lax",
            max_age=JWT_EXPIRE_HOURS * 60 * 60,
            path="/",
        )
        return {"success": True}
    finally:
        db.close()


@router.get("/auth/me")
def me(_auth=Depends(require_auth)):
    return {"email": _auth.get("sub")}


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    return {"success": True}


@router.post("/signal", status_code=201)
async def receive_signal(
    body: MT5SignalRequest,
    x_signal_key: Optional[str] = Header(None),
):
    if not SECRET_SIGNAL_KEY:
        raise HTTPException(status_code=500, detail="SECRET_SIGNAL_KEY not configured")
    signal_key = x_signal_key or body.SecretKey
    if signal_key != SECRET_SIGNAL_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    get_engine()
    db = get_session()
    try:
        signal_id = str(uuid.uuid4())
        db.execute(
            sqlt("""
                INSERT INTO signals (id, symbol, type, entry, sl, tp, action, raw_json, received_at)
                VALUES (:id, :symbol, :type, :entry, :sl, :tp, :action, :raw_json::jsonb, NOW())
            """),
            {
                "id": signal_id,
                "symbol": body.Symbol.upper(),
                "type": body.Type.upper(),
                "entry": body.Entry,
                "sl": body.SL,
                "tp": body.TP,
                "action": body.Action.upper(),
                "raw_json": json.dumps(body.model_dump()),
            },
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    finally:
        db.close()

    t = threading.Thread(
        target=broadcast_signal,
        args=(signal_id, body.Symbol, body.Type, body.Entry, body.SL, body.TP, body.Action),
        daemon=True,
    )
    t.start()
    return {"success": True, "signalId": signal_id}


@router.get("/signals")
def list_signals(
    page: int = 1,
    limit: int = 20,
    _auth=Depends(require_auth),
):
    limit = min(limit, 100)
    skip = (max(page, 1) - 1) * limit
    get_engine()
    db = get_session()
    try:
        total = db.execute(sqlt("SELECT COUNT(*) FROM signals")).scalar()
        rows = db.execute(
            sqlt("""
                SELECT id, symbol, type, entry, sl, tp, action, received_at
                FROM signals ORDER BY received_at DESC LIMIT :lim OFFSET :skip
            """),
            {"lim": limit, "skip": skip},
        ).fetchall()
        signals = []
        for row in rows:
            sid = row[0]
            log_rows = db.execute(
                sqlt("""
                    SELECT sl.id, sl.status, sl.error, sl.sent_at, c.id as ch_id, c.name as ch_name
                    FROM signal_logs sl JOIN channels c ON sl.channel_id = c.id
                    WHERE sl.signal_id = :sid ORDER BY sl.sent_at DESC
                """),
                {"sid": sid},
            ).fetchall()
            signals.append({
                "id": row[0],
                "symbol": row[1],
                "type": row[2],
                "entry": row[3],
                "sl": row[4],
                "tp": row[5],
                "action": row[6],
                "received_at": row[7].isoformat() if row[7] else None,
                "logs": [
                    {
                        "id": lr[0],
                        "status": lr[1],
                        "error": lr[2],
                        "sent_at": lr[3].isoformat() if lr[3] else None,
                        "channel": {"id": lr[4], "name": lr[5]},
                    }
                    for lr in log_rows
                ],
            })
        return {"signals": signals, "total": total, "page": page, "limit": limit}
    finally:
        db.close()


@router.get("/channels")
def list_channels(_auth=Depends(require_auth)):
    get_engine()
    db = get_session()
    try:
        rows = db.execute(
            sqlt("""
                SELECT id, name, platform, token_hint, chat_id, is_active, created_at, updated_at,
                    target_language, timezone, broker_info, ai_auto_reply
                FROM channels ORDER BY created_at DESC
            """)
        ).fetchall()
        return [
            {
                "id": r[0],
                "name": r[1],
                "platform": r[2],
                "token_hint": r[3],
                "chat_id": r[4],
                "is_active": r[5],
                "created_at": r[6].isoformat() if r[6] else None,
                "updated_at": r[7].isoformat() if r[7] else None,
                "target_language": r[8],
                "timezone": r[9],
                "broker_info": r[10],
                "ai_auto_reply": r[11] if len(r) > 11 else False,
            }
            for r in rows
        ]
    finally:
        db.close()


@router.post("/channels", status_code=201)
def create_channel(body: ChannelCreateRequest, _auth=Depends(require_auth)):
    if not body.name.strip() or not body.bot_token.strip() or not body.chat_id.strip():
        raise HTTPException(status_code=400, detail="name, bot_token, and chat_id are required")
    get_engine()
    db = get_session()
    try:
        ch_id = str(uuid.uuid4())
        enc = encrypt_token(body.bot_token.strip())
        hint = token_hint(body.bot_token.strip())
        broker_json = json.dumps(body.broker_info) if body.broker_info is not None else None
        db.execute(
            sqlt("""
                INSERT INTO channels (id, name, platform, encrypted_bot_token, token_hint, chat_id, is_active,
                    target_language, timezone, broker_info, ai_auto_reply, created_at, updated_at)
                VALUES (:id, :name, :platform, :enc, :hint, :chat_id, TRUE,
                    :target_language, :timezone, CAST(:broker_info AS JSONB), :ai_auto_reply, NOW(), NOW())
            """),
            {
                "id": ch_id,
                "name": body.name.strip(),
                "platform": body.platform,
                "enc": enc,
                "hint": hint,
                "chat_id": body.chat_id.strip(),
                "target_language": body.target_language,
                "timezone": body.timezone,
                "broker_info": broker_json,
                "ai_auto_reply": getattr(body, "ai_auto_reply", False),
            },
        )
        db.commit()
        row = db.execute(
            sqlt("SELECT id, name, platform, token_hint, chat_id, is_active, created_at, updated_at, target_language, timezone, broker_info, ai_auto_reply FROM channels WHERE id=:id"),
            {"id": ch_id},
        ).fetchone()
        return _channel_row_to_dict(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _channel_row_to_dict(row):
    if not row:
        return None
    d = {
        "id": row[0],
        "name": row[1],
        "platform": row[2],
        "token_hint": row[3],
        "chat_id": row[4],
        "is_active": row[5],
        "created_at": row[6].isoformat() if row[6] else None,
        "updated_at": row[7].isoformat() if row[7] else None,
    }
    if len(row) > 8:
        d["target_language"] = row[8]
        d["timezone"] = row[9] if len(row) > 9 else None
        d["broker_info"] = row[10] if len(row) > 10 else None
        d["ai_auto_reply"] = row[11] if len(row) > 11 else False
    return d


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: str, body: ChannelUpdateRequest, _auth=Depends(require_auth)):
    get_engine()
    db = get_session()
    try:
        updates = []
        params = {"id": channel_id}
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name.strip()
        if body.chat_id is not None:
            updates.append("chat_id = :chat_id")
            params["chat_id"] = body.chat_id.strip()
        if body.is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if body.bot_token is not None and body.bot_token.strip():
            updates.append("encrypted_bot_token = :enc")
            updates.append("token_hint = :hint")
            params["enc"] = encrypt_token(body.bot_token.strip())
            params["hint"] = token_hint(body.bot_token.strip())
        if body.target_language is not None:
            updates.append("target_language = :target_language")
            params["target_language"] = body.target_language.strip() if body.target_language else None
        if body.timezone is not None:
            updates.append("timezone = :timezone")
            params["timezone"] = body.timezone.strip() if body.timezone else None
        if body.broker_info is not None:
            updates.append("broker_info = CAST(:broker_info AS JSONB)")
            params["broker_info"] = json.dumps(body.broker_info)
        if body.ai_auto_reply is not None:
            updates.append("ai_auto_reply = :ai_auto_reply")
            params["ai_auto_reply"] = body.ai_auto_reply
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates.append("updated_at = NOW()")
        db.execute(sqlt(f"UPDATE channels SET {', '.join(updates)} WHERE id = :id"), params)
        db.commit()
        row = db.execute(
            sqlt("SELECT id, name, platform, token_hint, chat_id, is_active, created_at, updated_at, target_language, timezone, broker_info, ai_auto_reply FROM channels WHERE id=:id"),
            {"id": channel_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Channel not found")
        return _channel_row_to_dict(row)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/channels/{channel_id}")
def delete_channel(channel_id: str, _auth=Depends(require_auth)):
    get_engine()
    db = get_session()
    try:
        db.execute(sqlt("DELETE FROM channels WHERE id = :id"), {"id": channel_id})
        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/channels/{channel_id}/test")
def test_channel(channel_id: str, _auth=Depends(require_auth)):
    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt("SELECT encrypted_bot_token, chat_id FROM channels WHERE id = :id"),
            {"id": channel_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Channel not found")
        try:
            bot_token = decrypt_token(row[0])
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Failed to decrypt bot token — check MASTER_ENCRYPTION_KEY",
            )
        return send_telegram(
            bot_token,
            row[1],
            "✅ *Test Connection Successful!*\nYour Trade Signal Bridge is connected and encryption is working.",
        )
    finally:
        db.close()
