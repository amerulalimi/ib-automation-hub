"""Signal Forwarder API: Telethon accounts, source channels, forward rules."""
import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text as sqlt

from auth import require_auth, encrypt_token, decrypt_token
from database import get_engine, get_session
from rbac import assert_not_viewer, auth_role, auth_uid, assert_channel_access
from models import (
    TelethonAccountCreate,
    TelethonAccountUpdate,
    SourceChannelCreate,
    SourceChannelUpdate,
    ForwardRuleCreate,
)
from services.telethon_client import start_listener, stop_listener, is_running

router = APIRouter(prefix="/api", tags=["Signal Forwarder"])


def _run_db(coro_fn, *args, **kwargs):
    """Run sync DB code in thread from async route."""
    def _sync():
        get_engine()
        db = get_session()
        try:
            return coro_fn(db, *args, **kwargs)
        finally:
            db.close()
    return asyncio.to_thread(_sync)


# ----- Telethon accounts -----

@router.get("/telethon-accounts")
async def list_telethon_accounts(_auth=Depends(require_auth)):
    def _q(db):
        rows = db.execute(sqlt("""
            SELECT id, name, api_id, is_active, created_at, updated_at
            FROM telethon_accounts ORDER BY created_at DESC
        """)).fetchall()
        return [
            {"id": r[0], "name": r[1], "api_id": r[2], "api_hash": "***", "is_active": r[3], "created_at": r[4].isoformat() if r[4] else None, "updated_at": r[5].isoformat() if r[5] else None}
            for r in rows
        ]
    return await _run_db(lambda db: _q(db))


@router.post("/telethon-accounts", status_code=201)
async def create_telethon_account(body: TelethonAccountCreate, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    acc_id = str(uuid.uuid4())

    def _ins(db):
        db.execute(sqlt("""
            INSERT INTO telethon_accounts (id, name, api_id, api_hash, is_active, created_at, updated_at)
            VALUES (:id, :name, :api_id, :api_hash, TRUE, NOW(), NOW())
        """), {"id": acc_id, "name": body.name.strip(), "api_id": body.api_id, "api_hash": body.api_hash.strip()})
        db.commit()
        row = db.execute(sqlt("SELECT id, name, api_id, is_active, created_at, updated_at FROM telethon_accounts WHERE id=:id"), {"id": acc_id}).fetchone()
        return {"id": row[0], "name": row[1], "api_id": row[2], "api_hash": "***", "is_active": row[3], "created_at": row[4].isoformat() if row[4] else None, "updated_at": row[5].isoformat() if row[5] else None}

    return await _run_db(_ins)


@router.patch("/telethon-accounts/{account_id}")
async def update_telethon_account(account_id: str, body: TelethonAccountUpdate, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))

    def _up(db):
        updates = []
        params = {"id": account_id}
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name.strip()
        if body.api_id is not None:
            updates.append("api_id = :api_id")
            params["api_id"] = body.api_id
        if body.api_hash is not None:
            updates.append("api_hash = :api_hash")
            params["api_hash"] = body.api_hash.strip()
        if body.is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if body.session_string is not None and body.session_string.strip():
            enc = encrypt_token(body.session_string.strip())
            updates.append("encrypted_session = :enc")
            params["enc"] = enc
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates.append("updated_at = NOW()")
        db.execute(sqlt(f"UPDATE telethon_accounts SET {', '.join(updates)} WHERE id = :id"), params)
        db.commit()
        row = db.execute(sqlt("SELECT id, name, api_id, is_active, created_at, updated_at FROM telethon_accounts WHERE id=:id"), {"id": account_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"id": row[0], "name": row[1], "api_id": row[2], "api_hash": "***", "is_active": row[3], "created_at": row[4].isoformat() if row[4] else None, "updated_at": row[5].isoformat() if row[5] else None}

    try:
        return await _run_db(_up)
    except HTTPException:
        raise


@router.delete("/telethon-accounts/{account_id}")
async def delete_telethon_account(account_id: str, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))

    def _del(db):
        db.execute(sqlt("DELETE FROM telethon_accounts WHERE id = :id"), {"id": account_id})
        db.commit()

    await _run_db(_del)
    return {"success": True}


# ----- Source channels -----

@router.get("/source-channels")
async def list_source_channels(_auth=Depends(require_auth)):
    def _q(db):
        rows = db.execute(sqlt("""
            SELECT sc.id, sc.name, sc.telethon_account_id, sc.telegram_chat_id, sc.is_active, sc.created_at, sc.updated_at
            FROM source_channels sc ORDER BY sc.created_at DESC
        """)).fetchall()
        return [{"id": r[0], "name": r[1], "telethon_account_id": r[2], "telegram_chat_id": r[3], "is_active": r[4], "created_at": r[5].isoformat() if r[5] else None, "updated_at": r[6].isoformat() if r[6] else None} for r in rows]

    return await _run_db(lambda db: _q(db))


@router.post("/source-channels", status_code=201)
async def create_source_channel(body: SourceChannelCreate, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    ch_id = str(uuid.uuid4())

    def _ins(db):
        db.execute(sqlt("""
            INSERT INTO source_channels (id, name, telethon_account_id, telegram_chat_id, is_active, created_at, updated_at)
            VALUES (:id, :name, :aid, :chat_id, TRUE, NOW(), NOW())
        """), {"id": ch_id, "name": body.name.strip(), "aid": body.telethon_account_id.strip(), "chat_id": body.telegram_chat_id.strip()})
        db.commit()
        row = db.execute(sqlt("SELECT id, name, telethon_account_id, telegram_chat_id, is_active, created_at, updated_at FROM source_channels WHERE id=:id"), {"id": ch_id}).fetchone()
        return {"id": row[0], "name": row[1], "telethon_account_id": row[2], "telegram_chat_id": row[3], "is_active": row[4], "created_at": row[5].isoformat() if row[5] else None, "updated_at": row[6].isoformat() if row[6] else None}

    return await _run_db(_ins)


@router.patch("/source-channels/{channel_id}")
async def update_source_channel(channel_id: str, body: SourceChannelUpdate, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))

    def _up(db):
        updates = []
        params = {"id": channel_id}
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name.strip()
        if body.telegram_chat_id is not None:
            updates.append("telegram_chat_id = :telegram_chat_id")
            params["telegram_chat_id"] = body.telegram_chat_id.strip()
        if body.is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates.append("updated_at = NOW()")
        db.execute(sqlt(f"UPDATE source_channels SET {', '.join(updates)} WHERE id = :id"), params)
        db.commit()
        row = db.execute(sqlt("SELECT id, name, telethon_account_id, telegram_chat_id, is_active, created_at, updated_at FROM source_channels WHERE id=:id"), {"id": channel_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Source channel not found")
        return {"id": row[0], "name": row[1], "telethon_account_id": row[2], "telegram_chat_id": row[3], "is_active": row[4], "created_at": row[5].isoformat() if row[5] else None, "updated_at": row[6].isoformat() if row[6] else None}

    try:
        return await _run_db(_up)
    except HTTPException:
        raise


@router.delete("/source-channels/{channel_id}")
async def delete_source_channel(channel_id: str, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))

    def _del(db):
        db.execute(sqlt("DELETE FROM source_channels WHERE id = :id"), {"id": channel_id})
        db.commit()

    await _run_db(_del)
    return {"success": True}


# ----- Forward rules -----

@router.get("/forward-rules")
async def list_forward_rules(_auth=Depends(require_auth)):
    def _q(db):
        rows = db.execute(sqlt("""
            SELECT fr.id, fr.source_channel_id, fr.destination_channel_id, fr.created_at
            FROM forward_rules fr ORDER BY fr.created_at DESC
        """)).fetchall()
        return [{"id": r[0], "source_channel_id": r[1], "destination_channel_id": r[2], "created_at": r[3].isoformat() if r[3] else None} for r in rows]

    return await _run_db(lambda db: _q(db))


@router.post("/forward-rules", status_code=201)
async def create_forward_rule(body: ForwardRuleCreate, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    rule_id = str(uuid.uuid4())

    def _ins(db):
        assert_channel_access(db, body.destination_channel_id.strip(), role, uid)
        db.execute(sqlt("""
            INSERT INTO forward_rules (id, source_channel_id, destination_channel_id, created_at)
            VALUES (:id, :sid, :did, NOW())
        """), {"id": rule_id, "sid": body.source_channel_id.strip(), "did": body.destination_channel_id.strip()})
        db.commit()
        row = db.execute(sqlt("SELECT id, source_channel_id, destination_channel_id, created_at FROM forward_rules WHERE id=:id"), {"id": rule_id}).fetchone()
        return {"id": row[0], "source_channel_id": row[1], "destination_channel_id": row[2], "created_at": row[3].isoformat() if row[3] else None}

    try:
        return await _run_db(_ins)
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=400, detail="This forward rule already exists")
        raise


@router.delete("/forward-rules/{rule_id}")
async def delete_forward_rule(rule_id: str, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    role = auth_role(_auth)
    uid = auth_uid(_auth)

    def _del():
        get_engine()
        db = get_session()
        try:
            row = db.execute(
                sqlt("SELECT destination_channel_id FROM forward_rules WHERE id = :id"),
                {"id": rule_id},
            ).fetchone()
            if not row:
                return "not_found"
            assert_channel_access(db, row[0], role, uid)
            db.execute(sqlt("DELETE FROM forward_rules WHERE id = :id"), {"id": rule_id})
            db.commit()
            return "ok"
        finally:
            db.close()

    result = await asyncio.to_thread(_del)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Forward rule not found")
    return {"success": True}


# ----- Listener control -----

@router.post("/forwarder/start")
async def forwarder_start(_auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    await start_listener()
    return {"success": True, "running": is_running()}


@router.post("/forwarder/stop")
async def forwarder_stop(_auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    await stop_listener()
    return {"success": True, "running": is_running()}


@router.get("/forwarder/status")
async def forwarder_status(_auth=Depends(require_auth)):
    return {"running": is_running()}
