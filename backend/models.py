"""Pydantic request/response models."""
from typing import Optional
from pydantic import BaseModel


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
    bot_token: str
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

class ScheduledContentCreate(BaseModel):
    channel_id: str
    content: str
    scheduled_at: str


class ScheduledContentUpdate(BaseModel):
    content: Optional[str] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None


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
