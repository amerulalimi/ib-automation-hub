"""Signal Bridge API: auth, signals, channels."""
import json
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Depends, Response, Request
from sqlalchemy import text as sqlt
import os

from limiter import limiter

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
from rbac import (
    auth_role,
    auth_uid,
    assert_channel_access,
    assert_not_viewer,
    channel_owner_filter_sql,
    is_privileged,
)
from services.quota import enforce_channel_quota

# Placeholder when no bot token yet (must decrypt for tests; do not use for Telegram)
_PENDING_BOT_TOKEN_PLAIN = "__PENDING_NO_BOT_TOKEN_V1__"
TOKEN_HINT_PENDING = "NONE"


def _broker_name_ok(bi) -> bool:
    if bi is None:
        return False
    if isinstance(bi, str):
        try:
            bi = json.loads(bi)
        except Exception:
            return False
    if not isinstance(bi, dict):
        return False
    return bool(str(bi.get("name") or "").strip())
from database import get_engine, get_session
from telegram_notify import broadcast_signal, send_telegram

router = APIRouter(prefix="/api", tags=["Signal Bridge"])


@router.post("/auth/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, response: Response):
    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt(
                "SELECT id, password_hash, role, is_active FROM dashboard_users WHERE email = :email"
            ),
            {"email": body.email.strip()},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user_id, hash_val, role, is_active = row[0], row[1], row[2], row[3]
        if is_active is False:
            raise HTTPException(status_code=403, detail="Account disabled")
        import bcrypt
        hash_bytes = hash_val.encode("utf-8") if isinstance(hash_val, str) else hash_val
        if not bcrypt.checkpw(body.password.encode("utf-8"), hash_bytes):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        r = (role or "admin").strip()
        token = create_access_token(body.email.strip(), user_id, r)
        
        is_prod = os.getenv("ENVIRONMENT") == "production"
        
        response.set_cookie(
            key=AUTH_COOKIE_NAME,
            value=token,
            httponly=True,
            secure=is_prod,
            samesite="lax",
            max_age=JWT_EXPIRE_HOURS * 60 * 60,
            path="/",
        )
        return {"success": True}
    finally:
        db.close()


@router.get("/auth/me")
def me(_auth=Depends(require_auth)):
    get_engine()
    db = get_session()
    try:
        email = _auth.get("sub")
        row = db.execute(
            sqlt(
                """
                SELECT id, email, role, is_active, max_channels, max_ai_tokens_per_month,
                       max_scheduled_posts
                FROM dashboard_users WHERE email = :email
                """
            ),
            {"email": email},
        ).fetchone()
        if not row:
            return {
                "email": email,
                "id": _auth.get("uid"),
                "role": _auth.get("role"),
            }
        uid, em, role, active, max_ch, max_tok, max_sch = row
        ch_used = db.execute(
            sqlt("SELECT COUNT(*) FROM channels WHERE owner_id = :uid"),
            {"uid": uid},
        ).scalar()
        return {
            "email": em,
            "id": uid,
            "role": role,
            "is_active": active,
            "quotas": {
                "max_channels": max_ch,
                "max_ai_tokens_per_month": max_tok,
                "max_scheduled_posts": max_sch,
                "channels_used": int(ch_used or 0),
            },
        }
    finally:
        db.close()


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    return {"success": True}


@router.post("/signal", status_code=201)
@limiter.limit("60/minute")
async def receive_signal(
    request: Request,
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
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        if is_privileged(role) or not uid:
            total = db.execute(sqlt("SELECT COUNT(*) FROM signals")).scalar()
            rows = db.execute(
                sqlt("""
                    SELECT id, symbol, type, entry, sl, tp, action, received_at
                    FROM signals ORDER BY received_at DESC LIMIT :lim OFFSET :skip
                """),
                {"lim": limit, "skip": skip},
            ).fetchall()
        else:
            total = db.execute(
                sqlt("""
                    SELECT COUNT(DISTINCT s.id) FROM signals s
                    WHERE EXISTS (
                        SELECT 1 FROM signal_logs sl
                        JOIN channels c ON c.id = sl.channel_id
                        WHERE sl.signal_id = s.id AND c.owner_id = :uid
                    )
                """),
                {"uid": uid},
            ).scalar()
            rows = db.execute(
                sqlt("""
                    SELECT DISTINCT s.id, s.symbol, s.type, s.entry, s.sl, s.tp, s.action, s.received_at
                    FROM signals s
                    WHERE EXISTS (
                        SELECT 1 FROM signal_logs sl
                        JOIN channels c ON c.id = sl.channel_id
                        WHERE sl.signal_id = s.id AND c.owner_id = :uid
                    )
                    ORDER BY s.received_at DESC LIMIT :lim OFFSET :skip
                """),
                {"lim": limit, "skip": skip, "uid": uid},
            ).fetchall()
        signals = []
        for row in rows:
            sid = row[0]
            if is_privileged(role) or not uid:
                log_rows = db.execute(
                    sqlt("""
                        SELECT sl.id, sl.status, sl.error, sl.sent_at, c.id as ch_id, c.name as ch_name
                        FROM signal_logs sl JOIN channels c ON sl.channel_id = c.id
                        WHERE sl.signal_id = :sid ORDER BY sl.sent_at DESC
                    """),
                    {"sid": sid},
                ).fetchall()
            else:
                log_rows = db.execute(
                    sqlt("""
                        SELECT sl.id, sl.status, sl.error, sl.sent_at, c.id as ch_id, c.name as ch_name
                        FROM signal_logs sl JOIN channels c ON sl.channel_id = c.id
                        WHERE sl.signal_id = :sid AND c.owner_id = :uid
                        ORDER BY sl.sent_at DESC
                    """),
                    {"sid": sid, "uid": uid},
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
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    frag, extra = channel_owner_filter_sql(role, uid)
    get_engine()
    db = get_session()
    try:
        rows = db.execute(
            sqlt(f"""
                SELECT c.id, c.name, c.platform, c.token_hint, c.chat_id, c.is_active, c.created_at, c.updated_at,
                    c.target_language, c.timezone, c.broker_info, c.ai_auto_reply, c.owner_id, c.ai_api_config_id
                FROM channels c
                WHERE 1=1 {frag}
                ORDER BY c.created_at DESC
            """),
            extra,
        ).fetchall()
        out = []
        for r in rows:
            d = {
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
            if len(r) > 12:
                d["owner_id"] = r[12]
            if len(r) > 13:
                d["ai_api_config_id"] = r[13]
            out.append(d)
        return out
    finally:
        db.close()


@router.post("/channels", status_code=201)
def create_channel(body: ChannelCreateRequest, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    if not body.name.strip() or not body.chat_id.strip():
        raise HTTPException(status_code=400, detail="name and chat_id are required")
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        if uid:
            enforce_channel_quota(db, uid)
        ch_id = str(uuid.uuid4())
        bt = (body.bot_token or "").strip()
        if bt:
            enc = encrypt_token(bt)
            hint = token_hint(bt)
        else:
            enc = encrypt_token(_PENDING_BOT_TOKEN_PLAIN)
            hint = TOKEN_HINT_PENDING
        broker_json = json.dumps(body.broker_info) if body.broker_info is not None else None
        has_token = bool(bt)
        has_broker = _broker_name_ok(body.broker_info)
        initial_active = has_token and has_broker
        db.execute(
            sqlt("""
                INSERT INTO channels (id, owner_id, name, platform, encrypted_bot_token, token_hint, chat_id, is_active,
                    target_language, timezone, broker_info, ai_auto_reply, created_at, updated_at)
                VALUES (:id, :owner_id, :name, :platform, :enc, :hint, :chat_id, :is_active,
                    :target_language, :timezone, CAST(:broker_info AS JSONB), :ai_auto_reply, NOW(), NOW())
            """),
            {
                "id": ch_id,
                "owner_id": uid,
                "name": body.name.strip(),
                "platform": body.platform,
                "enc": enc,
                "hint": hint,
                "chat_id": body.chat_id.strip(),
                "is_active": initial_active,
                "target_language": body.target_language,
                "timezone": body.timezone,
                "broker_info": broker_json,
                "ai_auto_reply": getattr(body, "ai_auto_reply", False),
            },
        )
        db.commit()
        row = db.execute(
            sqlt(
                "SELECT id, name, platform, token_hint, chat_id, is_active, created_at, updated_at, target_language, timezone, broker_info, ai_auto_reply, owner_id, ai_api_config_id FROM channels WHERE id=:id"
            ),
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
    n = len(row)
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
    if n > 8:
        d["target_language"] = row[8]
    if n > 9:
        d["timezone"] = row[9]
    if n > 10:
        d["broker_info"] = row[10]
    if n > 11:
        d["ai_auto_reply"] = row[11]
    if n > 12:
        d["owner_id"] = row[12]
    if n > 13:
        d["ai_api_config_id"] = row[13]
    return d


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: str, body: ChannelUpdateRequest, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(db, channel_id, auth_role(_auth), auth_uid(_auth))
        cur = db.execute(
            sqlt(
                "SELECT token_hint, broker_info, owner_id FROM channels WHERE id = :id"
            ),
            {"id": channel_id},
        ).fetchone()
        if not cur:
            raise HTTPException(status_code=404, detail="Channel not found")
        eff_hint = cur[0]
        eff_broker = cur[1]
        ch_owner_id = cur[2]

        updates = []
        params = {"id": channel_id}
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name.strip()
        if body.chat_id is not None:
            updates.append("chat_id = :chat_id")
            params["chat_id"] = body.chat_id.strip()
        if body.bot_token is not None and body.bot_token.strip():
            updates.append("encrypted_bot_token = :enc")
            updates.append("token_hint = :hint")
            params["enc"] = encrypt_token(body.bot_token.strip())
            params["hint"] = token_hint(body.bot_token.strip())
            eff_hint = params["hint"]
        if body.broker_info is not None:
            eff_broker = body.broker_info
            updates.append("broker_info = CAST(:broker_info AS JSONB)")
            params["broker_info"] = json.dumps(body.broker_info)
        if body.is_active is not None:
            if body.is_active is True:
                if eff_hint == TOKEN_HINT_PENDING:
                    raise HTTPException(
                        status_code=400,
                        detail="Bot token is not set yet. Add a bot token before activating this channel.",
                    )
                if not _broker_name_ok(eff_broker):
                    raise HTTPException(
                        status_code=400,
                        detail="Broker name is not set yet. Set the broker name in Edit before activating.",
                    )
            updates.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if body.target_language is not None:
            updates.append("target_language = :target_language")
            params["target_language"] = body.target_language.strip() if body.target_language else None
        if body.timezone is not None:
            updates.append("timezone = :timezone")
            params["timezone"] = body.timezone.strip() if body.timezone else None
        if body.ai_auto_reply is not None:
            updates.append("ai_auto_reply = :ai_auto_reply")
            params["ai_auto_reply"] = body.ai_auto_reply
        if body.ai_api_config_id is not None:
            raw_cfg = (body.ai_api_config_id or "").strip()
            if not raw_cfg:
                updates.append("ai_api_config_id = NULL")
            else:
                if not ch_owner_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Channel has no owner; cannot attach AI configuration.",
                    )
                cfg_row = db.execute(
                    sqlt("SELECT owner_id FROM ai_api_configs WHERE id = :id"),
                    {"id": raw_cfg},
                ).fetchone()
                if not cfg_row or cfg_row[0] != ch_owner_id:
                    raise HTTPException(
                        status_code=400,
                        detail="AI configuration must belong to the same owner as the channel.",
                    )
                updates.append("ai_api_config_id = :aicfg")
                params["aicfg"] = raw_cfg
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates.append("updated_at = NOW()")
        db.execute(sqlt(f"UPDATE channels SET {', '.join(updates)} WHERE id = :id"), params)
        db.commit()
        row = db.execute(
            sqlt(
                "SELECT id, name, platform, token_hint, chat_id, is_active, created_at, updated_at, target_language, timezone, broker_info, ai_auto_reply, owner_id, ai_api_config_id FROM channels WHERE id=:id"
            ),
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
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(db, channel_id, auth_role(_auth), auth_uid(_auth))
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
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(db, channel_id, auth_role(_auth), auth_uid(_auth))
        row = db.execute(
            sqlt(
                "SELECT encrypted_bot_token, chat_id, token_hint FROM channels WHERE id = :id"
            ),
            {"id": channel_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Channel not found")
        if row[2] == TOKEN_HINT_PENDING:
            raise HTTPException(
                status_code=400,
                detail="Bot token is not set yet. Add a bot token before testing.",
            )
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
