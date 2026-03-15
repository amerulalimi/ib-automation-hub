"""AI API: batch content generation, RAG ingest/query (channel-scoped), deep linking."""
import asyncio

from fastapi import APIRouter, HTTPException, Depends

from auth import require_auth
from models import AIGenerateContentRequest, RAGIngestRequest, RAGQueryRequest
from services.ai_content import generate_batch_content_sync
from services.rag import ingest_sync, answer_with_rag_sync

router = APIRouter(prefix="/api", tags=["AI"])


def _run_sync(fn, *args, **kwargs):
    return asyncio.to_thread(fn, *args, **kwargs)


@router.post("/ai/generate-content")
async def generate_content(body: AIGenerateContentRequest, _auth=Depends(require_auth)):
    """Batch-create 30-365 days of content by topic, save to scheduled_contents for channel_id."""
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
