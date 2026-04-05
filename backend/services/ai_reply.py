"""
AI Auto-Reply Service
Generates personality-driven replies for Telegram messages.
Uses GPT-4o-mini with AIPersona (tone, knowledge_base).
"""
import logging
import uuid
from typing import Optional

from sqlalchemy import select

from database import get_engine, get_session, AIPersona, UsageLog, DashboardUser
from services.openai_credentials import build_openai_client_for_channel, ERR_NO_AI

logger = logging.getLogger(__name__)


async def generate_persona_reply(message_text: str, channel_id: str) -> Optional[str]:
    """
    Generate a response based on the channel's designated AI persona.
    """
    if not message_text or not message_text.strip():
        return None

    get_engine()
    db = get_session()
    try:
        client = build_openai_client_for_channel(db, channel_id)
    except RuntimeError as e:
        if ERR_NO_AI in str(e) or "No AI API configuration" in str(e):
            logger.warning("No AI API configuration for channel %s; auto-reply skipped.", channel_id)
        else:
            logger.warning("OpenAI client error for channel %s: %s", channel_id, e)
        return None
    finally:
        db.close()

    session = get_session()
    persona = None
    try:
        persona = session.scalar(
            select(AIPersona).where(AIPersona.channel_id == channel_id)
        )
    except Exception as e:
        logger.error(f"Failed to fetch AIPersona: {e}")
    finally:
        session.close()

    tone = persona.tone if persona else "Helpful and Professional"
    knowledge = persona.knowledge_base if persona else "You are a helpful admin for a Telegram trading channel."

    try:
        system_prompt = (
            f"Anda adalah admin bagi channel Telegram ini. "
            f"Balas mesej user menggunakan tone: {tone}.\n\n"
            f"Gunakan maklumat ini sebagai panduan (Knowledge Base):\n{knowledge}\n\n"
            "ARAHAN KRITIKAL:\n"
            "- Jangan guna ayat robot.\n"
            "- Balas macam manusia sedang bersembang.\n"
            "- Kalau soalan tentang Gold trading, tunjukkan kepakaran anda."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message_text},
            ],
            max_tokens=300,
            temperature=0.7,
        )

        reply = response.choices[0].message.content.strip() if response.choices else None

        if reply:
            _record_reply_usage(channel_id, {
                "user_message": message_text[:100],
                "ai_reply": reply[:100],
                "persona_name": persona.name if persona else "Default",
            })
            return reply

    except Exception as e:
        logger.error(f"AI Reply Generation Error: {e}")

    return None


def _record_reply_usage(channel_id: str, details: dict):
    """Record AI reply activity to UsageLog."""
    try:
        session = get_session()
        try:
            admin = session.scalar(
                select(DashboardUser).where(DashboardUser.role == "admin").limit(1)
            )
            user_id = admin.id if admin else None

            log = UsageLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                action_type="AI_REPLY_SENT",
                details={**details, "channel_id": channel_id},
            )
            session.add(log)
            session.commit()
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Failed to log AI reply: {e}")
