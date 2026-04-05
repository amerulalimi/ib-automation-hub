"""Database engine and session (optional; used when DATABASE_URL is set)."""
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text as sql_text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


# -----------------------------------------------------------------------------
# ORM Models
# -----------------------------------------------------------------------------


class DashboardUser(Base):
    """Dashboard login users (email + bcrypt password hash)."""
    __tablename__ = "dashboard_users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(
        String, nullable=False, default="viewer"
    )  # super_admin | admin | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_channels: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_ai_tokens_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_scheduled_posts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    usage_logs: Mapped[list["UsageLog"]] = relationship(
        "UsageLog", back_populates="user", cascade="all, delete-orphan"
    )


class Channel(Base):
    """Telegram (or other) channels for signal delivery."""
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("dashboard_users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    platform: Mapped[str] = mapped_column(String, nullable=False, default="telegram")
    encrypted_bot_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_hint: Mapped[str] = mapped_column(String, nullable=False)
    chat_id: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Telegram IB Automation Hub
    target_language: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    broker_info: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ai_auto_reply: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    signal_logs: Mapped[list["SignalLog"]] = relationship(
        "SignalLog", back_populates="channel", cascade="all, delete-orphan"
    )
    ai_persona: Mapped[Optional["AIPersona"]] = relationship(
        "AIPersona", back_populates="channel", uselist=False, cascade="all, delete-orphan"
    )


class Signal(Base):
    """Incoming MT5/signal payloads."""
    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    entry: Mapped[float] = mapped_column(Float, nullable=False)
    sl: Mapped[float] = mapped_column(Float, nullable=False)
    tp: Mapped[float] = mapped_column(Float, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    raw_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    signal_logs: Mapped[list["SignalLog"]] = relationship(
        "SignalLog", back_populates="signal", cascade="all, delete-orphan"
    )


class SignalLog(Base):
    """Per-channel delivery status for each signal."""
    __tablename__ = "signal_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    signal_id: Mapped[str] = mapped_column(
        String, ForeignKey("signals.id", ondelete="CASCADE"), nullable=False
    )
    channel_id: Mapped[str] = mapped_column(
        String, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    signal: Mapped["Signal"] = relationship("Signal", back_populates="signal_logs")
    channel: Mapped["Channel"] = relationship("Channel", back_populates="signal_logs")


class TelethonAccount(Base):
    """Telethon user accounts for listening to source channels."""
    __tablename__ = "telethon_accounts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    api_id: Mapped[int] = mapped_column(Integer, nullable=False)
    api_hash: Mapped[str] = mapped_column(String, nullable=False)
    encrypted_session: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    source_channels: Mapped[list["SourceChannel"]] = relationship(
        "SourceChannel", back_populates="telethon_account", cascade="all, delete-orphan"
    )


class SourceChannel(Base):
    """Source channels (Telegram) to listen to for forwarding."""
    __tablename__ = "source_channels"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    telethon_account_id: Mapped[str] = mapped_column(
        String, ForeignKey("telethon_accounts.id", ondelete="CASCADE"), nullable=False
    )
    telegram_chat_id: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    telethon_account: Mapped["TelethonAccount"] = relationship(
        "TelethonAccount", back_populates="source_channels"
    )


class ForwardRule(Base):
    """Rule: forward from source_channel to destination channel."""
    __tablename__ = "forward_rules"
    __table_args__ = (
        UniqueConstraint("source_channel_id", "destination_channel_id", name="uq_forward_rule"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_channel_id: Mapped[str] = mapped_column(
        String, ForeignKey("source_channels.id", ondelete="CASCADE"), nullable=False
    )
    destination_channel_id: Mapped[str] = mapped_column(
        String, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ScheduledContent(Base):
    """Scheduled messages to send to a channel."""
    __tablename__ = "scheduled_contents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    channel_id: Mapped[str] = mapped_column(
        String, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    post_kind: Mapped[str] = mapped_column(
        String, nullable=False, default="text", server_default="text"
    )
    post_meta: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=sql_text("'{}'::jsonb")
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AIPersona(Base):
    """AI persona settings for a channel."""
    __tablename__ = "ai_personas"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    channel_id: Mapped[str] = mapped_column(
        String, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    tone: Mapped[str] = mapped_column(String, nullable=False)
    knowledge_base: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    channel: Mapped["Channel"] = relationship("Channel", back_populates="ai_persona")


class UsageLog(Base):
    """Activity/Usage logs for SaaS tracking."""
    __tablename__ = "usage_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("dashboard_users.id", ondelete="SET NULL"), nullable=True
    )
    action_type: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped[Optional["DashboardUser"]] = relationship("DashboardUser", back_populates="usage_logs")


class TelegramClientSession(Base):
    """Telethon session storage to avoid repeated logins."""
    __tablename__ = "telegram_client_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    session_str: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# -----------------------------------------------------------------------------
# Engine, session, init
# -----------------------------------------------------------------------------

_db_engine = None
_Session = None


def _seed_dashboard_user():
    """Ensure an initial dashboard user exists (created only if missing)."""
    if _db_engine is None or _Session is None:
        return
    email = os.getenv("DASHBOARD_EMAIL")
    password = os.getenv("DASHBOARD_PASSWORD")
    if not email or not password:
        print("[DB] DASHBOARD_EMAIL or DASHBOARD_PASSWORD not set. Skipping seed.")
        return
    role = os.getenv("DASHBOARD_ROLE", "super_admin").strip() or "super_admin"
    try:
        import bcrypt
        from sqlalchemy import select
        session = _Session()
        try:
            existing = session.scalar(select(DashboardUser).where(DashboardUser.email == email))
            if existing is not None:
                return
            password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            session.add(
                DashboardUser(
                    id=str(uuid.uuid4()),
                    email=email,
                    password_hash=password_hash,
                    role=role,
                    is_active=True,
                )
            )
            session.commit()
        finally:
            session.close()
    except Exception as e:
        print(f"[DB] Seed dashboard user skipped: {e}")


def get_engine():
    global _db_engine, _Session
    if _db_engine is not None:
        return _db_engine
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    try:
        from sqlalchemy import create_engine, text
        from sqlalchemy.orm import sessionmaker
        engine = create_engine(db_url, pool_pre_ping=True)
        session_factory = sessionmaker(bind=engine, autoflush=False)

        # Ensure credentials work before caching globals.
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        _db_engine = engine
        _Session = session_factory
        _init_db()
        return _db_engine
    except Exception as e:
        _db_engine = None
        _Session = None
        print(f"[DB] Failed to connect: {e}")
        return None


def get_session():
    if _Session is None:
        get_engine()
    if _Session is None:
        raise HTTPException(
            status_code=503,
            detail="Database not configured. Set DATABASE_URL in .env",
        )
    return _Session()


def _init_db():
    if _db_engine is None:
        return
    # Schema is managed by Alembic (`alembic upgrade head`). Only seed optional bootstrap user.
    _seed_dashboard_user()
