"""AI batch content generation: create 30-365 days of posts by topic, save to scheduled_contents."""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import text as sqlt

from database import get_engine, get_session
from services.openai_credentials import build_openai_client_for_channel


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
    get_engine()
    db = get_session()
    try:
        client = build_openai_client_for_channel(db, channel_id)
    finally:
        db.close()
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
        db.commit()
    finally:
        db.close()
    return created


def bulk_generate_content(
    topic: str,
    days: int = 30,
    *,
    api_key: str,
    base_url: Optional[str] = None,
) -> list[dict]:
    """
    Generate multiple unique posts using OpenAI.
    Focus on Gold Trading (tips, motivation, market analysis).
    Output is beautiful Markdown (bold, lists, emojis).
    Returns a list of dicts: [{"content": "...", "scheduled_at": "..."}]
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required for AI content generation")

    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    client = OpenAI(**kwargs)

    prompt = f"""You are a professional Gold Trading expert for a premium Telegram channel.
Please generate {days} unique social media posts based on the topic: '{topic}'.
Vary the content types among: Gold trading tips, trader motivation, and market analysis.
Each post must use beautiful Telegram-friendly Markdown formatting (use bold, lists, and emojis) so it looks professional and engaging.

Output EXACTLY and ONLY a valid JSON array of objects.
Each object must have the following keys:
- "content": The generated post text in Markdown.
- "scheduled_at": An ISO 8601 timestamp string representing when the post should be published. Schedule the first post for tomorrow at 09:00:00 UTC, the second for the day after tomorrow at 09:00:00 UTC, and so on.

Do NOT include markdown code blocks (like ```json) in your response, just the raw JSON.
"""

    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4000,
        temperature=0.7,
    )

    if not r.choices or not r.choices[0].message.content:
        return []

    text = r.choices[0].message.content.strip()

    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    import json
    try:
        posts = json.loads(text)
        return posts
    except Exception as e:
        print(f"Error parsing JSON from OpenAI: {e}")
        return []
