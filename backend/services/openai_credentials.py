"""Resolve OpenAI API keys from encrypted ai_api_configs (per owner / per channel)."""
from __future__ import annotations

from typing import Any, Optional, Tuple

from sqlalchemy import text as sqlt

from auth import decrypt_token
from rbac import is_privileged

ERR_NO_AI = (
    "No AI API configuration. Add one under Dashboard > Channels > AI Configuration "
    "and set a default profile."
)


def ai_config_owner_filter_sql(role: str, uid: Optional[str]) -> tuple[str, dict]:
    """Same idea as channel_owner_filter_sql: privileged users see all configs."""
    if is_privileged(role):
        return "", {}
    if not uid:
        return " AND 1=0", {}
    return " AND a.owner_id = :_owner_id", {"_owner_id": uid}


def get_first_destination_channel_id_for_source(source_channel_id: str) -> Optional[str]:
    """First active destination channel for forward rules (Telethon / signal parser credentials)."""
    from database import get_engine, get_session

    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt("""
                SELECT c.id FROM forward_rules fr
                JOIN channels c ON c.id = fr.destination_channel_id
                WHERE fr.source_channel_id = :sid AND c.is_active = TRUE
                LIMIT 1
            """),
            {"sid": source_channel_id},
        ).fetchone()
        return str(row[0]) if row else None
    finally:
        db.close()


def _fetch_config_by_id(db, config_id: str):
    return db.execute(
        sqlt(
            "SELECT encrypted_api_key, base_url, owner_id FROM ai_api_configs WHERE id = :id"
        ),
        {"id": config_id},
    ).fetchone()


def assert_config_accessible(
    db, config_id: str, acting_uid: Optional[str], role: str
) -> None:
    row = _fetch_config_by_id(db, config_id)
    if not row:
        raise RuntimeError("AI configuration not found")
    owner_id = row[2]
    if not is_privileged(role):
        if not acting_uid or acting_uid != owner_id:
            raise RuntimeError("AI configuration not found")


def get_api_key_and_base_url_for_config_id(
    db, config_id: str, acting_uid: Optional[str], role: str
) -> Tuple[str, Optional[str]]:
    assert_config_accessible(db, config_id, acting_uid, role)
    row = _fetch_config_by_id(db, config_id)
    assert row is not None
    api_key = decrypt_token(row[0])
    base_url = (row[1] or "").strip() or None
    return api_key, base_url


def _fetch_encrypted_credentials_for_channel(db, channel_id: str) -> Optional[Tuple[str, Optional[str]]]:
    row = db.execute(
        sqlt(
            "SELECT owner_id, ai_api_config_id FROM channels WHERE id = :cid"
        ),
        {"cid": channel_id},
    ).fetchone()
    if not row:
        return None
    owner_id, cfg_id = row[0], row[1]
    if cfg_id:
        r2 = db.execute(
            sqlt(
                "SELECT encrypted_api_key, base_url, owner_id FROM ai_api_configs WHERE id = :id"
            ),
            {"id": cfg_id},
        ).fetchone()
        if r2 and r2[2] == owner_id:
            return r2[0], (r2[1] or "").strip() or None
    if not owner_id:
        return None
    r3 = db.execute(
        sqlt("""
            SELECT encrypted_api_key, base_url FROM ai_api_configs
            WHERE owner_id = :oid AND is_default = TRUE
            LIMIT 1
        """),
        {"oid": owner_id},
    ).fetchone()
    if r3:
        return r3[0], (r3[1] or "").strip() or None
    r4 = db.execute(
        sqlt("""
            SELECT encrypted_api_key, base_url FROM ai_api_configs
            WHERE owner_id = :oid
            ORDER BY created_at ASC
            LIMIT 1
        """),
        {"oid": owner_id},
    ).fetchone()
    if r4:
        return r4[0], (r4[1] or "").strip() or None
    return None


def get_api_key_and_base_url_for_channel(db, channel_id: str) -> Tuple[str, Optional[str]]:
    creds = _fetch_encrypted_credentials_for_channel(db, channel_id)
    if not creds:
        raise RuntimeError(ERR_NO_AI)
    api_key = decrypt_token(creds[0])
    return api_key, creds[1]


def build_openai_client_for_channel(db, channel_id: str):
    from openai import OpenAI

    api_key, base_url = get_api_key_and_base_url_for_channel(db, channel_id)
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def build_openai_client_for_config_id(
    db, config_id: str, acting_uid: Optional[str], role: str
):
    from openai import OpenAI

    api_key, base_url = get_api_key_and_base_url_for_config_id(
        db, config_id, acting_uid, role
    )
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


async def build_async_openai_client_for_channel(db, channel_id: str):
    from openai import AsyncOpenAI

    api_key, base_url = get_api_key_and_base_url_for_channel(db, channel_id)
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


def count_ai_configs_any(db) -> int:
    n = db.execute(sqlt("SELECT COUNT(*) FROM ai_api_configs")).scalar()
    return int(n or 0)
