"""Admin API: dashboard user CRUD (privileged roles)."""
import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text as sqlt

from database import get_engine, get_session
from models import AdminUserCreate, AdminUserUpdate
from rbac import ROLE_SUPER_ADMIN, auth_role, require_privileged, require_super_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users")
def list_users(_auth: dict = Depends(require_privileged)):
    get_engine()
    db = get_session()
    try:
        rows = db.execute(
            sqlt(
                """
                SELECT id, email, role, is_active, max_channels, max_ai_tokens_per_month,
                       max_scheduled_posts, created_at
                FROM dashboard_users ORDER BY created_at DESC
                """
            )
        ).fetchall()
        return {
            "users": [
                {
                    "id": r[0],
                    "email": r[1],
                    "role": r[2],
                    "is_active": r[3],
                    "max_channels": r[4],
                    "max_ai_tokens_per_month": r[5],
                    "max_scheduled_posts": r[6],
                    "created_at": r[7].isoformat() if r[7] else None,
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@router.post("/users", status_code=201)
def create_user(body: AdminUserCreate, _auth: dict = Depends(require_privileged)):
    get_engine()
    db = get_session()
    email = body.email.strip().lower()
    if not email or not body.password or len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Valid email and password (8+ chars) required")
    role = (body.role or "viewer").strip()
    if role == ROLE_SUPER_ADMIN and auth_role(_auth) != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only super_admin can assign super_admin")
    try:
        exists = db.execute(
            sqlt("SELECT 1 FROM dashboard_users WHERE email = :e"),
            {"e": email},
        ).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="Email already registered")
        uid = str(uuid.uuid4())
        pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
        db.execute(
            sqlt(
                """
                INSERT INTO dashboard_users (
                    id, email, password_hash, role, is_active,
                    max_channels, max_ai_tokens_per_month, max_scheduled_posts, created_at
                )
                VALUES (
                    :id, :email, :ph, :role, TRUE,
                    :mc, :mt, :ms, NOW()
                )
                """
            ),
            {
                "id": uid,
                "email": email,
                "ph": pw_hash,
                "role": role,
                "mc": body.max_channels,
                "mt": body.max_ai_tokens_per_month,
                "ms": body.max_scheduled_posts,
            },
        )
        db.commit()
        return {"id": uid, "email": email, "role": role}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: AdminUserUpdate,
    _auth: dict = Depends(require_privileged),
):
    get_engine()
    db = get_session()
    try:
        if body.role == ROLE_SUPER_ADMIN and auth_role(_auth) != ROLE_SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only super_admin can assign super_admin")
        updates = []
        params: dict = {"id": user_id}
        if body.role is not None:
            updates.append("role = :role")
            params["role"] = body.role.strip()
        if body.is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if body.max_channels is not None:
            updates.append("max_channels = :max_channels")
            params["max_channels"] = body.max_channels
        if body.max_ai_tokens_per_month is not None:
            updates.append("max_ai_tokens_per_month = :max_ai_tokens_per_month")
            params["max_ai_tokens_per_month"] = body.max_ai_tokens_per_month
        if body.max_scheduled_posts is not None:
            updates.append("max_scheduled_posts = :max_scheduled_posts")
            params["max_scheduled_posts"] = body.max_scheduled_posts
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        db.execute(
            sqlt(f"UPDATE dashboard_users SET {', '.join(updates)} WHERE id = :id"),
            params,
        )
        db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/users/{user_id}")
def delete_user(user_id: str, _auth: dict = Depends(require_super_admin)):
    """Hard-delete user (super_admin only)."""
    if _auth.get("uid") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    get_engine()
    db = get_session()
    try:
        db.execute(sqlt("DELETE FROM dashboard_users WHERE id = :id"), {"id": user_id})
        db.commit()
        return {"success": True}
    finally:
        db.close()
