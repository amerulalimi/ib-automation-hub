"""AI batch content generation: create 30-365 days of posts by topic, save to scheduled_contents."""
import os
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text as sqlt

from database import get_engine, get_session


def get_channel_timezone(channel_id: str) -> str:
    get_engine()
    db = get_session()
    try:
        row = db.execute(
            sqlt("SELECT timezone FROM channels WHERE id = :id"),
            {"id": channel_id},
        ).fetchone()
        return (row[0] or "UTC").strip() if row else "UTC"
    finally:
        db.close()


def generate_batch_content_sync(topic: str, channel_id: str, days: int, post_hour: int = 9) -> list[dict]:
    """
    Call LLM to generate a set of post texts (one per day or similar), then insert into
    scheduled_contents with scheduled_at spread over the range using channel timezone.
    Returns list of created {id, scheduled_at, content_preview}.
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required for AI content generation")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")
    client = OpenAI(api_key=api_key)
    # Ask for N post ideas (one per day or fewer if 365)
    num_posts = min(days, 365)
    prompt = f"""Generate exactly {num_posts} short social media post texts for a Telegram channel about: {topic}.
Each post should be 1-3 sentences, engaging and varied. Number each post as "Post 1:", "Post 2:", etc.
Do not include any other commentary."""
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4000,
    )
    if not r.choices or not r.choices[0].message.content:
        return []
    text = r.choices[0].message.content
    posts = []
    current = []
    for line in text.split("\n"):
        line = line.strip()
        if line.upper().startswith("POST ") and ":" in line:
            if current:
                posts.append("\n".join(current))
            current = [line.split(":", 1)[-1].strip()]
        elif current and line:
            current.append(line)
    if current:
        posts.append("\n".join(current))
    if not posts:
        posts = [text[:500]]
    tz_str = get_channel_timezone(channel_id)
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(tz_str)
    except Exception:
        tz = None
    base = datetime.now(tz) if tz else datetime.utcnow()
    get_engine()
    db = get_session()
    created = []
    try:
        for i, content in enumerate(posts[:num_posts]):
            scheduled = base + timedelta(days=i)
            scheduled = scheduled.replace(hour=post_hour, minute=0, second=0, microsecond=0)
            if tz:
                scheduled = scheduled.astimezone(tz)
            sc_id = str(uuid.uuid4())
            db.execute(
                sqlt("""
                    INSERT INTO scheduled_contents (id, channel_id, content, scheduled_at, status, created_at, updated_at)
                    VALUES (:id, :channel_id, :content, :scheduled_at::timestamptz, 'pending', NOW(), NOW())
                """),
                {"id": sc_id, "channel_id": channel_id, "content": content, "scheduled_at": scheduled.isoformat()},
            )
            created.append({"id": sc_id, "scheduled_at": scheduled.isoformat(), "content_preview": content[:80] + "..." if len(content) > 80 else content})
        db.commit()
    finally:
        db.close()
    return created
