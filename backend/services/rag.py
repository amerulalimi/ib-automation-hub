"""RAG with pgvector: ingest and query with channel_id metadata filtering (multi-tenant)."""
import os
import uuid
from typing import Optional

from sqlalchemy import text as sqlt

from database import get_engine, get_session

EMBEDDING_DIM = 1536


def _get_embedding(text: str) -> list[float]:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        r = client.embeddings.create(model="text-embedding-3-small", input=text)
        return r.data[0].embedding
    except Exception:
        return [0.0] * EMBEDDING_DIM


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


def ingest_sync(channel_id: str, text: str) -> list[str]:
    """Split text into chunks, embed, insert into knowledge_chunks with channel_id. Returns list of chunk ids."""
    chunks = _chunk_text(text)
    if not chunks:
        return []
    get_engine()
    db = get_session()
    created = []
    try:
        for c in chunks:
            emb = _get_embedding(c)
            ch_id = str(uuid.uuid4())
            db.execute(
                sqlt("""
                    INSERT INTO knowledge_chunks (id, channel_id, content, embedding, metadata, created_at)
                    VALUES (:id, :channel_id, :content, :embedding::vector, '{}'::jsonb, NOW())
                """),
                {"id": ch_id, "channel_id": channel_id, "content": c, "embedding": "[" + ",".join(map(str, emb)) + "]"},
            )
            created.append(ch_id)
        db.commit()
    except Exception as e:
        db.rollback()
        raise RuntimeError(f"RAG ingest failed (pgvector may be disabled): {e}") from e
    finally:
        db.close()
    return created


def query_sync(channel_id: str, question: str, k: int = 5) -> list[dict]:
    """Get embedding for question, similarity search in knowledge_chunks WHERE channel_id = :channel_id, return top k chunks."""
    emb = _get_embedding(question)
    emb_str = "[" + ",".join(map(str, emb)) + "]"
    get_engine()
    db = get_session()
    try:
        rows = db.execute(
            sqlt("""
                SELECT id, content, metadata, 1 - (embedding <=> :emb::vector) AS similarity
                FROM knowledge_chunks
                WHERE channel_id = :channel_id
                ORDER BY embedding <=> :emb::vector
                LIMIT :k
            """),
            {"channel_id": channel_id, "emb": emb_str, "k": k},
        ).fetchall()
        return [{"id": r[0], "content": r[1], "metadata": r[2], "similarity": float(r[3])} for r in rows]
    except Exception as e:
        raise RuntimeError(f"RAG query failed (pgvector may be disabled): {e}") from e
    finally:
        db.close()


def answer_with_rag_sync(channel_id: str, question: str, k: int = 5) -> str:
    """Retrieve top k chunks for channel_id, then LLM answer using context. Multi-tenant: only channel_id chunks."""
    chunks = query_sync(channel_id, question, k=k)
    context = "\n\n".join(c["content"] for c in chunks) if chunks else ""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Answer based only on the following context. If the context does not contain the answer, say so. Keep answers concise."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
            ],
            max_tokens=300,
        )
        if r.choices and r.choices[0].message.content:
            return r.choices[0].message.content.strip()
    except Exception:
        pass
    return "I couldn't find an answer in the knowledge base."
