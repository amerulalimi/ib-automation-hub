"""Scheduler API: scheduled content CRUD (Celery posts at scheduled_at)."""
import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import text as sqlt

from auth import require_auth
from database import get_engine, get_session
from models import ScheduledContentCreate, ScheduledContentUpdate

router = APIRouter(prefix="/api", tags=["Scheduler"])


def _run_db(fn, *args, **kwargs):
    def _sync():
        get_engine()
        db = get_session()
        try:
            return fn(db, *args, **kwargs)
        finally:
            db.close()
    return asyncio.to_thread(_sync)


def _row_to_item(row):
    return {
        "id": row[0],
        "channel_id": row[1],
        "content": row[2],
        "scheduled_at": row[3].isoformat() if row[3] else None,
        "status": row[4],
        "sent_at": row[5].isoformat() if row[5] else None,
        "error": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
        "updated_at": row[8].isoformat() if row[8] else None,
    }


@router.get("/scheduled-contents")
async def list_scheduled_contents(
    channel_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = Query(100, le=500),
    _auth=Depends(require_auth),
):
    def _q(db):
        q = """
            SELECT id, channel_id, content, scheduled_at, status, sent_at, error, created_at, updated_at
            FROM scheduled_contents WHERE 1=1
        """
        params = {"lim": limit}
        if channel_id:
            q += " AND channel_id = :channel_id"
            params["channel_id"] = channel_id
        if from_date:
            q += " AND scheduled_at >= :from_date"
            params["from_date"] = from_date
        if to_date:
            q += " AND scheduled_at <= :to_date"
            params["to_date"] = to_date
        q += " ORDER BY scheduled_at DESC LIMIT :lim"
        rows = db.execute(sqlt(q), params).fetchall()
        return [_row_to_item(r) for r in rows]

    return await _run_db(_q)


@router.post("/scheduled-contents", status_code=201)
async def create_scheduled_content(body: ScheduledContentCreate, _auth=Depends(require_auth)):
    sc_id = str(uuid.uuid4())

    def _ins(db):
        db.execute(
            sqlt("""
                INSERT INTO scheduled_contents (id, channel_id, content, scheduled_at, status, created_at, updated_at)
                VALUES (:id, :channel_id, :content, :scheduled_at::timestamptz, 'pending', NOW(), NOW())
            """),
            {"id": sc_id, "channel_id": body.channel_id.strip(), "content": body.content.strip(), "scheduled_at": body.scheduled_at},
        )
        db.commit()
        row = db.execute(
            sqlt("SELECT id, channel_id, content, scheduled_at, status, sent_at, error, created_at, updated_at FROM scheduled_contents WHERE id=:id"),
            {"id": sc_id},
        ).fetchone()
        return _row_to_item(row)

    return await _run_db(_ins)


@router.patch("/scheduled-contents/{content_id}")
async def update_scheduled_content(content_id: str, body: ScheduledContentUpdate, _auth=Depends(require_auth)):
    def _up(db):
        updates = []
        params = {"id": content_id}
        if body.content is not None:
            updates.append("content = :content")
            params["content"] = body.content.strip()
        if body.scheduled_at is not None:
            updates.append("scheduled_at = :scheduled_at::timestamptz")
            params["scheduled_at"] = body.scheduled_at
        if body.status is not None:
            updates.append("status = :status")
            params["status"] = body.status.strip()
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates.append("updated_at = NOW()")
        db.execute(sqlt(f"UPDATE scheduled_contents SET {', '.join(updates)} WHERE id = :id"), params)
        db.commit()
        row = db.execute(
            sqlt("SELECT id, channel_id, content, scheduled_at, status, sent_at, error, created_at, updated_at FROM scheduled_contents WHERE id=:id"),
            {"id": content_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scheduled content not found")
        return _row_to_item(row)

    return await _run_db(_up)


@router.delete("/scheduled-contents/{content_id}")
async def delete_scheduled_content(content_id: str, _auth=Depends(require_auth)):
    def _del(db):
        cur = db.execute(sqlt("UPDATE scheduled_contents SET status = 'cancelled', updated_at = NOW() WHERE id = :id"), {"id": content_id})
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scheduled content not found")

    await _run_db(_del)
    return {"success": True}
