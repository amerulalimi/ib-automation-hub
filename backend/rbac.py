"""Role-based access: super_admin, admin, viewer."""
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy import text as sqlt

from auth import require_auth

ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_VIEWER = "viewer"

PRIVILEGED_ROLES = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN})


def auth_role(payload: dict) -> str:
    return (payload.get("role") or ROLE_ADMIN).strip()


def auth_uid(payload: dict) -> Optional[str]:
    return payload.get("uid")


def is_privileged(role: str) -> bool:
    return role in PRIVILEGED_ROLES


def require_privileged(_auth: dict = Depends(require_auth)) -> dict:
    if not is_privileged(auth_role(_auth)):
        raise HTTPException(status_code=403, detail="Admin access required")
    return _auth


def require_super_admin(_auth: dict = Depends(require_auth)) -> dict:
    if auth_role(_auth) != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return _auth


def channel_owner_filter_sql(role: str, uid: Optional[str]) -> tuple[str, dict]:
    """Returns SQL fragment AND ... and params for channel queries."""
    if is_privileged(role) or not uid:
        return "", {}
    return " AND c.owner_id = :_owner_id", {"_owner_id": uid}


def assert_channel_access(db, channel_id: str, role: str, uid: Optional[str]) -> None:
    if is_privileged(role):
        row = db.execute(
            sqlt("SELECT 1 FROM channels WHERE id = :id"),
            {"id": channel_id},
        ).fetchone()
    elif not uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    else:
        row = db.execute(
            sqlt("SELECT 1 FROM channels WHERE id = :id AND owner_id = :uid"),
            {"id": channel_id, "uid": uid},
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")


def assert_not_viewer(role: str) -> None:
    if role == ROLE_VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot modify resources")
