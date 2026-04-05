"""Scheduler API: scheduled content CRUD (Celery posts at scheduled_at)."""
import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import text as sqlt

from auth import require_auth
from database import get_engine, get_session
from rbac import auth_role, auth_uid, assert_channel_access, assert_not_viewer, channel_owner_filter_sql
from services.quota import enforce_scheduled_post_quota
from models import (
    ScheduledContentCreate,
    ScheduledContentUpdate,
    normalize_scheduled_post_meta,
)

router = APIRouter(prefix="/api", tags=["Scheduler"])

_DEBUG_LOG_PATH = Path(__file__).resolve().parents[2] / "debug-aa8423.log"


def _agent_debug_create(payload: dict) -> None:
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


_ALLOWED_LIST_STATUSES = frozenset({"pending", "sent", "failed", "cancelled"})
_ALLOWED_LIMITS = frozenset({20, 50, 100})


def _run_db(fn, *args, **kwargs):
    def _sync():
        get_engine()
        db = get_session()
        try:
            return fn(db, *args, **kwargs)
        finally:
            db.close()
    return asyncio.to_thread(_sync)


def _coerce_meta(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def _row_to_item(row):
    return {
        "id": row[0],
        "channel_id": row[1],
        "content": row[2],
        "post_kind": row[3] if row[3] else "text",
        "post_meta": _coerce_meta(row[4]),
        "scheduled_at": row[5].isoformat() if row[5] else None,
        "status": row[6],
        "sent_at": row[7].isoformat() if row[7] else None,
        "error": row[8],
        "created_at": row[9].isoformat() if row[9] else None,
        "updated_at": row[10].isoformat() if row[10] else None,
    }


def _list_filter_sql(
    frag: str,
    extra: dict,
    channel_id: Optional[str],
    from_date: Optional[str],
    to_date: Optional[str],
    status: Optional[str],
) -> tuple[str, dict]:
    q = f"""
        FROM scheduled_contents sc
        JOIN channels c ON c.id = sc.channel_id
        WHERE 1=1 {frag}
    """
    params = {**extra}
    if channel_id:
        q += " AND sc.channel_id = :channel_id"
        params["channel_id"] = channel_id
    if from_date:
        q += " AND sc.scheduled_at >= CAST(:from_date AS TIMESTAMPTZ)"
        params["from_date"] = from_date
    if to_date:
        q += " AND sc.scheduled_at <= CAST(:to_date AS TIMESTAMPTZ)"
        params["to_date"] = to_date
    if status:
        q += " AND sc.status = :status"
        params["status"] = status
    return q, params


@router.get("/scheduled-contents")
async def list_scheduled_contents(
    channel_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1),
    offset: int = Query(0, ge=0),
    _auth=Depends(require_auth),
):
    if limit not in _ALLOWED_LIMITS:
        raise HTTPException(
            status_code=400,
            detail="limit must be 20, 50, or 100",
        )
    if status is not None and status not in _ALLOWED_LIST_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of: {', '.join(sorted(_ALLOWED_LIST_STATUSES))}",
        )

    def _q(db):
        frag, extra = channel_owner_filter_sql(auth_role(_auth), auth_uid(_auth))
        tail, params = _list_filter_sql(frag, extra, channel_id, from_date, to_date, status)
        count_sql = "SELECT COUNT(*) " + tail
        total = db.execute(sqlt(count_sql), params).scalar() or 0

        sel = (
            "SELECT sc.id, sc.channel_id, sc.content, sc.post_kind, sc.post_meta, "
            "sc.scheduled_at, sc.status, sc.sent_at, sc.error, sc.created_at, sc.updated_at "
            + tail
            + " ORDER BY sc.scheduled_at DESC LIMIT :lim OFFSET :off"
        )
        params = {**params, "lim": limit, "off": offset}
        rows = db.execute(sqlt(sel), params).fetchall()
        return {"items": [_row_to_item(r) for r in rows], "total": int(total)}

    return await _run_db(_q)


@router.post("/scheduled-contents", status_code=201)
async def create_scheduled_content(body: ScheduledContentCreate, _auth=Depends(require_auth)):
    sc_id = str(uuid.uuid4())
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    assert_not_viewer(role)

    def _ins(db):
        assert_channel_access(db, body.channel_id.strip(), role, uid)
        if uid:
            enforce_scheduled_post_quota(db, uid, body.channel_id.strip())
        content_val = body.content.strip()
        _agent_debug_create(
            {
                "hypothesisId": "H4",
                "location": "scheduler.create_scheduled_content:_ins",
                "message": "insert_scheduled",
                "data": {
                    "post_kind": body.post_kind,
                    "meta_keys": sorted((body.post_meta or {}).keys()),
                    "content_len": len(content_val),
                },
                "runId": "debug1",
            }
        )
        db.execute(
            sqlt("""
                INSERT INTO scheduled_contents (
                    id, channel_id, content, post_kind, post_meta, scheduled_at, status, created_at, updated_at
                )
                VALUES (
                    :id, :channel_id, :content, :post_kind, CAST(:post_meta AS jsonb),
                    CAST(:scheduled_at AS TIMESTAMPTZ), 'pending', NOW(), NOW()
                )
            """),
            {
                "id": sc_id,
                "channel_id": body.channel_id.strip(),
                "content": content_val,
                "post_kind": body.post_kind,
                "post_meta": json.dumps(body.post_meta),
                "scheduled_at": body.scheduled_at,
            },
        )
        db.commit()
        row = db.execute(
            sqlt(
                "SELECT id, channel_id, content, post_kind, post_meta, scheduled_at, status, "
                "sent_at, error, created_at, updated_at FROM scheduled_contents WHERE id=:id"
            ),
            {"id": sc_id},
        ).fetchone()
        return _row_to_item(row)

    return await _run_db(_ins)


@router.post("/scheduled-contents/upload-photo")
async def upload_scheduled_photo(
    file: UploadFile = File(...),
    _auth=Depends(require_auth),
):
    """Upload an image to S3-compatible storage; returns a public https URL for scheduled photo posts."""
    role = auth_role(_auth)
    assert_not_viewer(role)
    uid = auth_uid(_auth) or "unknown"
    data = await file.read()
    from services.s3_storage import upload_scheduled_post_image

    url = upload_scheduled_post_image(data, file.content_type or "application/octet-stream", uid)
    return {"photo_url": url}


class BulkItem(BaseModel):
    content: str
    scheduled_at: str


class BulkScheduledContentCreate(BaseModel):
    channel_id: str
    items: list[BulkItem]


@router.post("/scheduled-contents/bulk", status_code=201)
async def create_scheduled_content_bulk(body: BulkScheduledContentCreate, _auth=Depends(require_auth)):
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    assert_not_viewer(role)

    def _bulk_ins(db):
        assert_channel_access(db, body.channel_id.strip(), role, uid)
        if uid:
            enforce_scheduled_post_quota(
                db, uid, body.channel_id.strip(), additional=len(body.items)
            )
        created_items = []
        for item in body.items:
            sc_id = str(uuid.uuid4())
            db.execute(
                sqlt("""
                    INSERT INTO scheduled_contents (
                        id, channel_id, content, post_kind, post_meta, scheduled_at, status, created_at, updated_at
                    )
                    VALUES (
                        :id, :channel_id, :content, 'text', '{}'::jsonb,
                        CAST(:scheduled_at AS TIMESTAMPTZ), 'pending', NOW(), NOW()
                    )
                """),
                {
                    "id": sc_id,
                    "channel_id": body.channel_id.strip(),
                    "content": item.content.strip(),
                    "scheduled_at": item.scheduled_at,
                },
            )
            created_items.append({"id": sc_id, "content": item.content, "scheduled_at": item.scheduled_at})
        db.commit()
        return {"message": f"Successfully scheduled {len(created_items)} posts.", "items": created_items}

    return await _run_db(_bulk_ins)


@router.patch("/scheduled-contents/{content_id}")
async def update_scheduled_content(content_id: str, body: ScheduledContentUpdate, _auth=Depends(require_auth)):
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    assert_not_viewer(role)

    def _up(db):
        crow = db.execute(
            sqlt(
                "SELECT channel_id, content, post_kind, post_meta FROM scheduled_contents WHERE id = :id"
            ),
            {"id": content_id},
        ).fetchone()
        if not crow:
            raise HTTPException(status_code=404, detail="Scheduled content not found")
        assert_channel_access(db, crow[0], role, uid)
        _ch, cur_content, cur_kind, cur_meta = crow[0], crow[1], crow[2] or "text", _coerce_meta(crow[3])

        merged_kind = body.post_kind if body.post_kind is not None else cur_kind
        merged_content = body.content.strip() if body.content is not None else cur_content
        merged_meta_raw = body.post_meta if body.post_meta is not None else cur_meta
        touch_payload = (
            body.content is not None
            or body.post_kind is not None
            or body.post_meta is not None
        )
        norm_meta = None
        if touch_payload:
            try:
                norm_meta = normalize_scheduled_post_meta(
                    merged_kind, merged_content, merged_meta_raw
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e

        updates = []
        params: dict = {"id": content_id}
        if touch_payload:
            updates.append("post_kind = :post_kind")
            updates.append("post_meta = CAST(:post_meta AS jsonb)")
            params["post_kind"] = merged_kind
            params["post_meta"] = json.dumps(norm_meta)
        if body.content is not None:
            updates.append("content = :content")
            params["content"] = merged_content
        if body.scheduled_at is not None:
            updates.append("scheduled_at = CAST(:scheduled_at AS TIMESTAMPTZ)")
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
            sqlt(
                "SELECT id, channel_id, content, post_kind, post_meta, scheduled_at, status, "
                "sent_at, error, created_at, updated_at FROM scheduled_contents WHERE id=:id"
            ),
            {"id": content_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scheduled content not found")
        return _row_to_item(row)

    return await _run_db(_up)


@router.delete("/scheduled-contents/{content_id}")
async def delete_scheduled_content(content_id: str, _auth=Depends(require_auth)):
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    assert_not_viewer(role)

    def _del(db):
        crow = db.execute(
            sqlt("SELECT channel_id FROM scheduled_contents WHERE id = :id"),
            {"id": content_id},
        ).fetchone()
        if not crow:
            raise HTTPException(status_code=404, detail="Scheduled content not found")
        assert_channel_access(db, crow[0], role, uid)
        cur = db.execute(sqlt("UPDATE scheduled_contents SET status = 'cancelled', updated_at = NOW() WHERE id = :id"), {"id": content_id})
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scheduled content not found")

    await _run_db(_del)
    return {"success": True}
