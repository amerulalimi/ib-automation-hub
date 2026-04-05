"""CRUD for encrypted per-user OpenAI (and compatible) API configurations."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text as sqlt

from auth import encrypt_token, require_auth, token_hint
from database import get_engine, get_session
from models import AIApiConfigCreate, AIApiConfigUpdate
from rbac import assert_not_viewer, auth_role, auth_uid, is_privileged
from services.openai_credentials import (
    ai_config_owner_filter_sql,
    build_openai_client_for_config_id,
)

router = APIRouter(prefix="/api", tags=["AI Config"])


def _clear_other_defaults(db, owner_id: str, except_id: str) -> None:
    db.execute(
        sqlt(
            "UPDATE ai_api_configs SET is_default = FALSE, updated_at = NOW() "
            "WHERE owner_id = :oid AND id != :eid"
        ),
        {"oid": owner_id, "eid": except_id},
    )


@router.get("/ai-configs")
def list_ai_configs(_auth=Depends(require_auth)):
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    frag, extra = ai_config_owner_filter_sql(role, uid)
    get_engine()
    db = get_session()
    try:
        rows = db.execute(
            sqlt(f"""
                SELECT a.id, a.owner_id, a.name, a.provider, a.base_url, a.api_key_hint,
                       a.is_default, a.created_at, a.updated_at
                FROM ai_api_configs a
                WHERE 1=1 {frag}
                ORDER BY a.is_default DESC, a.created_at DESC
            """),
            extra,
        ).fetchall()
        return [
            {
                "id": r[0],
                "owner_id": r[1],
                "name": r[2],
                "provider": r[3],
                "base_url": r[4],
                "api_key_hint": r[5],
                "is_default": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
                "updated_at": r[8].isoformat() if r[8] else None,
            }
            for r in rows
        ]
    finally:
        db.close()


@router.post("/ai-configs", status_code=201)
def create_ai_config(body: AIApiConfigCreate, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    uid = auth_uid(_auth)
    if not uid:
        raise HTTPException(status_code=400, detail="User id required")
    if not body.name.strip() or not body.api_key.strip():
        raise HTTPException(status_code=400, detail="name and api_key are required")
    get_engine()
    db = get_session()
    try:
        existing = db.execute(
            sqlt("SELECT COUNT(*) FROM ai_api_configs WHERE owner_id = :uid"),
            {"uid": uid},
        ).scalar()
        is_default = body.is_default or int(existing or 0) == 0
        cfg_id = str(uuid.uuid4())
        enc = encrypt_token(body.api_key.strip())
        hint = token_hint(body.api_key.strip())
        prov = (body.provider or "openai").strip() or "openai"
        bu = body.base_url.strip() if body.base_url else None
        if is_default:
            _clear_other_defaults(db, uid, cfg_id)
        db.execute(
            sqlt("""
                INSERT INTO ai_api_configs (
                    id, owner_id, name, provider, base_url, encrypted_api_key, api_key_hint,
                    is_default, created_at, updated_at
                ) VALUES (
                    :id, :owner_id, :name, :provider, :base_url, :enc, :hint,
                    :is_default, NOW(), NOW()
                )
            """),
            {
                "id": cfg_id,
                "owner_id": uid,
                "name": body.name.strip(),
                "provider": prov,
                "base_url": bu,
                "enc": enc,
                "hint": hint,
                "is_default": is_default,
            },
        )
        db.commit()
        row = db.execute(
            sqlt("""
                SELECT id, owner_id, name, provider, base_url, api_key_hint, is_default, created_at, updated_at
                FROM ai_api_configs WHERE id = :id
            """),
            {"id": cfg_id},
        ).fetchone()
        return {
            "id": row[0],
            "owner_id": row[1],
            "name": row[2],
            "provider": row[3],
            "base_url": row[4],
            "api_key_hint": row[5],
            "is_default": row[6],
            "created_at": row[7].isoformat() if row[7] else None,
            "updated_at": row[8].isoformat() if row[8] else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.patch("/ai-configs/{config_id}")
def update_ai_config(
    config_id: str, body: AIApiConfigUpdate, _auth=Depends(require_auth)
):
    assert_not_viewer(auth_role(_auth))
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt("SELECT owner_id FROM ai_api_configs WHERE id = :id"),
            {"id": config_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="AI configuration not found")
        owner_id = row[0]
        if not is_privileged(role) and uid != owner_id:
            raise HTTPException(status_code=404, detail="AI configuration not found")
        updates = []
        params: dict = {"id": config_id}
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name.strip()
        if body.api_key is not None and body.api_key.strip():
            updates.append("encrypted_api_key = :enc")
            updates.append("api_key_hint = :hint")
            params["enc"] = encrypt_token(body.api_key.strip())
            params["hint"] = token_hint(body.api_key.strip())
        if body.provider is not None:
            updates.append("provider = :provider")
            params["provider"] = (body.provider or "openai").strip() or "openai"
        if body.base_url is not None:
            updates.append("base_url = :base_url")
            params["base_url"] = body.base_url.strip() if body.base_url.strip() else None
        if body.is_default is not None:
            updates.append("is_default = :is_default")
            params["is_default"] = body.is_default
            if body.is_default:
                _clear_other_defaults(db, owner_id, config_id)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates.append("updated_at = NOW()")
        db.execute(
            sqlt(f"UPDATE ai_api_configs SET {', '.join(updates)} WHERE id = :id"),
            params,
        )
        db.commit()
        out = db.execute(
            sqlt("""
                SELECT id, owner_id, name, provider, base_url, api_key_hint, is_default, created_at, updated_at
                FROM ai_api_configs WHERE id = :id
            """),
            {"id": config_id},
        ).fetchone()
        return {
            "id": out[0],
            "owner_id": out[1],
            "name": out[2],
            "provider": out[3],
            "base_url": out[4],
            "api_key_hint": out[5],
            "is_default": out[6],
            "created_at": out[7].isoformat() if out[7] else None,
            "updated_at": out[8].isoformat() if out[8] else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/ai-configs/{config_id}")
def delete_ai_config(config_id: str, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt("SELECT owner_id FROM ai_api_configs WHERE id = :id"),
            {"id": config_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="AI configuration not found")
        if not is_privileged(role) and uid != row[0]:
            raise HTTPException(status_code=404, detail="AI configuration not found")
        db.execute(sqlt("DELETE FROM ai_api_configs WHERE id = :id"), {"id": config_id})
        db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/ai-configs/{config_id}/test")
def test_ai_config(config_id: str, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        try:
            client = build_openai_client_for_config_id(db, config_id, uid, role)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        try:
            models = client.models.list()
            first_id = None
            if models.data:
                first_id = models.data[0].id
            return {"ok": True, "error": None, "model_sample": first_id}
        except Exception as e:
            return {"ok": False, "error": str(e), "model_sample": None}
    finally:
        db.close()
