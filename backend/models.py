"""Pydantic request/response models."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class GenerateReportRequest(BaseModel):
    broker: str
    account_no: str
    start_deposit: float = 1000.0
    profit_percent: float = 10.0
    symbol: str = ""
    max_rows: int = 10
    date_from: str = ""
    date_to: str = ""
    has_withdrawal: bool = False
    withdrawal_amount: float = 0.0
    is_dummy: bool = True


class HealthResponse(BaseModel):
    status: str
    message: str


# ── Signal Bridge ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class MT5SignalRequest(BaseModel):
    Symbol: str
    Type: str
    Entry: float
    SL: float
    TP: float
    Action: str
    SecretKey: Optional[str] = None


class ChannelCreateRequest(BaseModel):
    name: str
    bot_token: Optional[str] = None
    chat_id: str
    platform: str = "telegram"
    target_language: Optional[str] = None
    timezone: Optional[str] = None
    broker_info: Optional[dict] = None
    ai_auto_reply: bool = False


class ChannelUpdateRequest(BaseModel):
    name: Optional[str] = None
    chat_id: Optional[str] = None
    is_active: Optional[bool] = None
    bot_token: Optional[str] = None
    target_language: Optional[str] = None
    timezone: Optional[str] = None
    broker_info: Optional[dict] = None
    ai_auto_reply: Optional[bool] = None
    ai_api_config_id: Optional[str] = None


# ── Signal Forwarder (Telegram IB) ───────────────────────────────────────────

class TelethonAccountCreate(BaseModel):
    name: str
    api_id: int
    api_hash: str


class TelethonAccountUpdate(BaseModel):
    name: Optional[str] = None
    api_id: Optional[int] = None
    api_hash: Optional[str] = None
    is_active: Optional[bool] = None
    session_string: Optional[str] = None


class SourceChannelCreate(BaseModel):
    name: str
    telethon_account_id: str
    telegram_chat_id: str


class SourceChannelUpdate(BaseModel):
    name: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    is_active: Optional[bool] = None


class ForwardRuleCreate(BaseModel):
    source_channel_id: str
    destination_channel_id: str


# ── Scheduler ────────────────────────────────────────────────────────────────

ScheduledPostKind = Literal["text", "photo", "poll"]


def normalize_scheduled_post_meta(
    post_kind: str, content: str, post_meta: Optional[dict[str, Any]]
) -> dict[str, Any]:
    """Validate kind/meta/content; return normalized post_meta (poll fields coerced)."""
    meta = dict(post_meta or {})
    if post_kind == "text":
        if not (content or "").strip():
            raise ValueError("content is required for text posts")
        return {}
    if post_kind == "photo":
        url = (meta.get("photo_url") or "").strip()
        if not url.startswith("https://"):
            raise ValueError("post_meta.photo_url must be a non-empty https:// URL")
        if len(content or "") > 1024:
            raise ValueError("caption (content) must be at most 1024 characters for photos")
        return {"photo_url": url}
    if post_kind == "poll":
        q = (meta.get("question") or "").strip()
        opts = meta.get("options") or []
        if not q:
            raise ValueError("post_meta.question is required for poll posts")
        if not isinstance(opts, list) or len(opts) < 2 or len(opts) > 10:
            raise ValueError("post_meta.options must be a list of 2–10 strings")
        cleaned: list[str] = []
        for o in opts:
            if not isinstance(o, str) or not o.strip():
                raise ValueError("each poll option must be a non-empty string")
            cleaned.append(o.strip())
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("poll options must be unique")
        return {
            "question": q,
            "options": cleaned,
            "is_anonymous": bool(meta.get("is_anonymous", True)),
            "allows_multiple_answers": bool(meta.get("allows_multiple_answers", False)),
        }
    raise ValueError("post_kind must be text, photo, or poll")


class ScheduledContentCreate(BaseModel):
    channel_id: str
    content: str = ""
    scheduled_at: str
    post_kind: ScheduledPostKind = "text"
    post_meta: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_scheduled_post(self):
        self.post_meta = normalize_scheduled_post_meta(
            self.post_kind, self.content, self.post_meta
        )
        return self


class ScheduledContentUpdate(BaseModel):
    content: Optional[str] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None
    post_kind: Optional[ScheduledPostKind] = None
    post_meta: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def post_meta_requires_kind(self):
        if self.post_meta is not None and self.post_kind is None:
            raise ValueError("post_meta cannot be set without post_kind")
        return self


# ── AI API configs (encrypted keys in DB) ────────────────────────────────────


class AIApiConfigCreate(BaseModel):
    name: str
    api_key: str
    provider: str = "openai"
    base_url: Optional[str] = None
    is_default: bool = False


class AIApiConfigUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    is_default: Optional[bool] = None


# ── AI / RAG ───────────────────────────────────────────────────────────────────

class AIGenerateContentRequest(BaseModel):
    channel_id: str
    topic: str
    days: int = 30


class RAGIngestRequest(BaseModel):
    channel_id: str
    text: Optional[str] = None


class RAGQueryRequest(BaseModel):
    channel_id: str
    question: str


# ── AI Persona ───────────────────────────────────────────────────────────────

class AIPersonaCreate(BaseModel):
    channel_id: str
    name: str
    tone: str
    knowledge_base: Optional[str] = None


class AIPersonaUpdate(BaseModel):
    name: Optional[str] = None
    tone: Optional[str] = None
    knowledge_base: Optional[str] = None


# ── Admin user management ────────────────────────────────────────────────────


class AdminUserCreate(BaseModel):
    email: str
    password: str
    role: str = "viewer"
    max_channels: Optional[int] = None
    max_ai_tokens_per_month: Optional[int] = None
    max_scheduled_posts: Optional[int] = None


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    max_channels: Optional[int] = None
    max_ai_tokens_per_month: Optional[int] = None
    max_scheduled_posts: Optional[int] = None


class PersonaTestRequest(BaseModel):
    channel_id: str
    message: str


# ── MT5 Candlestick Export ──────────────────────────────────────────────────


class MT5LoginRequest(BaseModel):
    account_no: str
    password: str
    broker_server: str


class MT5ExportRequest(BaseModel):
    account_no: str
    password: str
    broker_server: str
    symbols: list[str]
    timeframe: str
    date_from: str  # ISO date
    date_to: str    # ISO date
