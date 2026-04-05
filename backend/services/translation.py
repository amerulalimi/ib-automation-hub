"""Dictionary-first translation with LLM fallback for signal text."""
from typing import Optional

from database import get_engine, get_session
from services.openai_credentials import build_async_openai_client_for_channel

_TRANSLATION_DICT: dict[str, dict[str, str]] = {
    "Sell Gold Now": {"Malay": "Jual Gold Sekarang", "en": "Sell Gold Now"},
    "Buy Gold Now": {"Malay": "Beli Gold Sekarang", "en": "Buy Gold Now"},
    "NEW SIGNAL": {"Malay": "SIGNAL BAHARU", "en": "NEW SIGNAL"},
    "Entry": {"Malay": "Kemasukan", "en": "Entry"},
    "Action": {"Malay": "Tindakan", "en": "Action"},
    "OPEN": {"Malay": "BUKA", "en": "OPEN"},
    "CLOSE": {"Malay": "TUTUP", "en": "CLOSE"},
    "BUY": {"Malay": "BELI", "en": "BUY"},
    "SELL": {"Malay": "JUAL", "en": "SELL"},
}


def _normalize_lang(lang: Optional[str]) -> str:
    if not lang or not lang.strip():
        return "en"
    return lang.strip()


async def translate_signal_message(
    message: str, target_language: str, channel_id: str
) -> str:
    """
    Dictionary-first: replace known phrases. Fallback to LLM for full message if target is not en.
    """
    lang = _normalize_lang(target_language)
    if lang == "en":
        return message
    result = message
    for phrase, translations in _TRANSLATION_DICT.items():
        if phrase in result:
            result = result.replace(
                phrase, translations.get(lang, translations.get("en", phrase))
            )
    try:
        get_engine()
        db = get_session()
        try:
            client = await build_async_openai_client_for_channel(db, channel_id)
        finally:
            db.close()
        r = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Translate the following trading signal text to {lang}. "
                        "Keep numbers, Markdown formatting (`...`) and emojis unchanged. "
                        "Reply with only the translation."
                    ),
                },
                {"role": "user", "content": result},
            ],
            max_tokens=500,
        )
        if r.choices and r.choices[0].message.content:
            return r.choices[0].message.content.strip()
    except Exception:
        pass
    return result
