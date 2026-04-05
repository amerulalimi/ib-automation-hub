"""AI API: batch content generation, RAG ingest/query (channel-scoped), deep linking."""
import asyncio

from fastapi import APIRouter, HTTPException, Depends

from auth import require_auth
from models import (
    AIGenerateContentRequest,
    RAGIngestRequest,
    RAGQueryRequest,
    AIPersonaCreate,
    AIPersonaUpdate,
    PersonaTestRequest,
)
from rbac import (
    auth_role,
    auth_uid,
    assert_channel_access,
    assert_not_viewer,
    is_privileged,
)
from services.ai_content import generate_batch_content_sync, bulk_generate_content
from services.openai_credentials import get_api_key_and_base_url_for_config_id
from services.rag import ingest_sync, answer_with_rag_sync
from database import get_engine, get_session
import uuid
from sqlalchemy import text as sqlt
from pydantic import BaseModel

class AIBulkGenerateRequest(BaseModel):
    topic: str
    days: int = 30
    ai_config_id: str

router = APIRouter(prefix="/api", tags=["AI"])


def _run_sync(fn, *args, **kwargs):
    return asyncio.to_thread(fn, *args, **kwargs)


@router.post("/ai/bulk-generate-preview")
async def bulk_generate_preview(body: AIBulkGenerateRequest, _auth=Depends(require_auth)):
    """Generate multiple posts (without saving) for the frontend to preview or save later."""
    days = max(1, min(365, body.days))
    cfg = (body.ai_config_id or "").strip()
    if not cfg:
        raise HTTPException(status_code=400, detail="ai_config_id is required")
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        api_key, base_url = get_api_key_and_base_url_for_config_id(db, cfg, uid, role)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        db.close()
    try:
        items = await asyncio.to_thread(
            bulk_generate_content,
            body.topic.strip(),
            days,
            api_key=api_key,
            base_url=base_url,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"generated": len(items), "items": items}


@router.post("/ai/generate-content")
async def generate_content(body: AIGenerateContentRequest, _auth=Depends(require_auth)):
    """Batch-create 30-365 days of content by topic, save to scheduled_contents for channel_id."""
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(
            db, body.channel_id.strip(), auth_role(_auth), auth_uid(_auth)
        )
    finally:
        db.close()
    days = max(1, min(365, body.days))
    try:
        created = await _run_sync(
            generate_batch_content_sync,
            body.topic.strip(),
            body.channel_id.strip(),
            days,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"created": len(created), "items": created}


@router.post("/ai/rag/ingest")
async def rag_ingest(body: RAGIngestRequest, _auth=Depends(require_auth)):
    """Ingest text into knowledge_chunks for channel_id (multi-tenant: only this channel)."""
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(
            db, body.channel_id.strip(), auth_role(_auth), auth_uid(_auth)
        )
    finally:
        db.close()
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text required")
    try:
        ids = await _run_sync(ingest_sync, body.channel_id.strip(), body.text.strip())
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"ingested": len(ids), "chunk_ids": ids}


@router.post("/ai/rag/query")
async def rag_query(body: RAGQueryRequest, _auth=Depends(require_auth)):
    """RAG query: retrieve channel-scoped chunks and return LLM answer. Use channel_id from deep link (start=CH_ID)."""
    get_engine()
    db = get_session()
    try:
        assert_channel_access(
            db, body.channel_id.strip(), auth_role(_auth), auth_uid(_auth)
        )
    finally:
        db.close()
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="question required")
    try:
        answer = await _run_sync(
            answer_with_rag_sync,
            body.channel_id.strip(),
            body.question.strip(),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"channel_id": body.channel_id, "answer": answer}


@router.get("/ai/deep-link-info")
async def deep_link_info(_auth=Depends(require_auth)):
    """Return how to build Telegram deep link so user origin = channel_id for RAG/auto-reply.
    Format: https://t.me/BOT_USERNAME?start=CH_ID — when user taps, bot receives /start CH_ID.
    Use CH_ID in all AI/RAG and auto-reply so knowledge is scoped to that channel."""
    return {
        "format": "https://t.me/BOT_USERNAME?start=CH_ID",
        "description": "Use CH_ID as channel_id in POST /api/ai/rag/query and for AI auto-reply so retrieval is channel-scoped.",
    }


# ── Usage Logs ───────────────────────────────────────────────────────────────

@router.get("/ai/usage-logs")
async def list_usage_logs(page: int = 1, limit: int = 50, _auth=Depends(require_auth)):
    """List activity logs across the system."""
    limit = min(limit, 100)
    skip = (max(page, 1) - 1) * limit
    role = auth_role(_auth)
    uid = auth_uid(_auth)
    get_engine()
    db = get_session()
    try:
        if is_privileged(role) or not uid:
            total = db.execute(sqlt("SELECT COUNT(*) FROM usage_logs")).scalar()
            rows = db.execute(
                sqlt("""
                    SELECT l.id, l.user_id, l.action_type, l.details, l.timestamp, u.email
                    FROM usage_logs l
                    LEFT JOIN dashboard_users u ON l.user_id = u.id
                    ORDER BY l.timestamp DESC LIMIT :lim OFFSET :skip
                """),
                {"lim": limit, "skip": skip},
            ).fetchall()
        else:
            total = db.execute(
                sqlt(
                    "SELECT COUNT(*) FROM usage_logs WHERE user_id = :uid OR user_id IS NULL"
                ),
                {"uid": uid},
            ).scalar()
            rows = db.execute(
                sqlt("""
                    SELECT l.id, l.user_id, l.action_type, l.details, l.timestamp, u.email
                    FROM usage_logs l
                    LEFT JOIN dashboard_users u ON l.user_id = u.id
                    WHERE l.user_id = :uid OR l.user_id IS NULL
                    ORDER BY l.timestamp DESC LIMIT :lim OFFSET :skip
                """),
                {"lim": limit, "skip": skip, "uid": uid},
            ).fetchall()
        logs = []
        for r in rows:
            logs.append({
                "id": r[0],
                "user_id": r[1],
                "action_type": r[2],
                "details": r[3],
                "timestamp": r[4].isoformat() if r[4] else None,
                "user_email": r[5]
            })
        return {"logs": logs, "total": total, "page": page, "limit": limit}
    finally:
        db.close()


# ── AI Personas ─────────────────────────────────────────────────────────────

@router.get("/ai/personas/{channel_id}")
async def get_persona(channel_id: str, _auth=Depends(require_auth)):
    """Get the AI Persona for a specific channel."""
    get_engine()
    db = get_session()
    try:
        assert_channel_access(db, channel_id, auth_role(_auth), auth_uid(_auth))
        row = db.execute(
            sqlt("SELECT id, name, tone, knowledge_base FROM ai_personas WHERE channel_id = :cid"),
            {"cid": channel_id},
        ).fetchone()
        if not row:
            return None
        return {"id": row[0], "name": row[1], "tone": row[2], "knowledge_base": row[3]}
    finally:
        db.close()


@router.post("/ai/personas", status_code=201)
async def create_persona(body: AIPersonaCreate, _auth=Depends(require_auth)):
    """Create a new AI Persona for a channel."""
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(
            db, body.channel_id.strip(), auth_role(_auth), auth_uid(_auth)
        )
        p_id = str(uuid.uuid4())
        db.execute(
            sqlt("""
                INSERT INTO ai_personas (id, channel_id, name, tone, knowledge_base, created_at)
                VALUES (:id, :channel_id, :name, :tone, :kb, NOW())
            """),
            {
                "id": p_id,
                "channel_id": body.channel_id,
                "name": body.name,
                "tone": body.tone,
                "kb": body.knowledge_base
            },
        )
        db.commit()
        return {"success": True, "id": p_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.patch("/ai/personas/{persona_id}")
async def update_persona(persona_id: str, body: AIPersonaUpdate, _auth=Depends(require_auth)):
    """Update an existing AI Persona."""
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        prow = db.execute(
            sqlt("SELECT channel_id FROM ai_personas WHERE id = :id"),
            {"id": persona_id},
        ).fetchone()
        if not prow:
            raise HTTPException(status_code=404, detail="Persona not found")
        assert_channel_access(db, prow[0], auth_role(_auth), auth_uid(_auth))
        updates = []
        params = {"id": persona_id}
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name
        if body.tone is not None:
            updates.append("tone = :tone")
            params["tone"] = body.tone
        if body.knowledge_base is not None:
            updates.append("knowledge_base = :kb")
            params["kb"] = body.knowledge_base
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        db.execute(sqlt(f"UPDATE ai_personas SET {', '.join(updates)} WHERE id = :id"), params)
        db.commit()
        return {"success": True}
    finally:
        db.close()


@router.post("/ai/personas/test-reply")
async def test_persona_reply(body: PersonaTestRequest, _auth=Depends(require_auth)):
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(
            db, body.channel_id.strip(), auth_role(_auth), auth_uid(_auth)
        )
    finally:
        db.close()
    from services.ai_reply import generate_persona_reply

    reply = await generate_persona_reply(body.message.strip(), body.channel_id.strip())
    return {"reply": reply}


@router.get("/ai/rag/chunks/{channel_id}")
async def rag_list_chunks(
    channel_id: str, limit: int = 100, _auth=Depends(require_auth)
):
    get_engine()
    db = get_session()
    try:
        assert_channel_access(db, channel_id, auth_role(_auth), auth_uid(_auth))
    finally:
        db.close()
    from services.rag import list_chunks_sync, count_chunks_sync

    return {
        "channel_id": channel_id,
        "chunk_count": count_chunks_sync(channel_id),
        "chunks": list_chunks_sync(channel_id, limit),
    }


@router.delete("/ai/rag/chunks/{channel_id}/{chunk_id}")
async def rag_delete_chunk(
    channel_id: str, chunk_id: str, _auth=Depends(require_auth)
):
    assert_not_viewer(auth_role(_auth))
    get_engine()
    db = get_session()
    try:
        assert_channel_access(db, channel_id, auth_role(_auth), auth_uid(_auth))
    finally:
        db.close()
    from services.rag import delete_chunk_sync

    if not delete_chunk_sync(chunk_id, channel_id):
        raise HTTPException(status_code=404, detail="Chunk not found")
    return {"success": True}
