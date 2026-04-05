"""Per-user quota checks (channels, scheduled posts)."""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text as sqlt


def _user_quotas_row(db, user_id: str):
    return db.execute(
        sqlt(
            """
            SELECT max_channels, max_scheduled_posts
            FROM dashboard_users WHERE id = :id
            """
        ),
        {"id": user_id},
    ).fetchone()


def enforce_channel_quota(db, user_id: str) -> None:
    row = _user_quotas_row(db, user_id)
    if not row:
        return
    max_ch, _ = row
    if max_ch is None:
        return
    n = db.execute(
        sqlt("SELECT COUNT(*) FROM channels WHERE owner_id = :uid"),
        {"uid": user_id},
    ).scalar()
    if n is not None and int(n) >= int(max_ch):
        raise HTTPException(
            status_code=403,
            detail=f"Channel quota reached (limit {max_ch}).",
        )


def enforce_scheduled_post_quota(
    db, user_id: str, channel_id: str, additional: int = 1
) -> None:
    row = _user_quotas_row(db, user_id)
    if not row:
        return
    _, max_posts = row
    if max_posts is None:
        return
    n = db.execute(
        sqlt(
            """
            SELECT COUNT(*) FROM scheduled_contents sc
            JOIN channels c ON c.id = sc.channel_id
            WHERE c.owner_id = :uid
              AND sc.created_at >= date_trunc('month', NOW())
            """
        ),
        {"uid": user_id},
    ).scalar()
    if n is not None and int(n) + int(additional) > int(max_posts):
        raise HTTPException(
            status_code=403,
            detail=f"Scheduled post quota for this month would be exceeded (limit {max_posts}).",
        )
