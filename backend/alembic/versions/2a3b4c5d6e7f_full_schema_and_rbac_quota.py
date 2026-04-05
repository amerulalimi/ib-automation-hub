"""Full application schema (IF NOT EXISTS) + RBAC/quota columns.

Revision ID: 2a3b4c5d6e7f
Revises: 1c663efc1214
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op

revision: str = "2a3b4c5d6e7f"
down_revision: Union[str, Sequence[str], None] = "1c663efc1214"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pgvector is optional (e.g. local Postgres without the extension). Login/RBAC
    # migrations must still run; RAG uses vector when present.
    op.execute(
        """
        DO $pgv$
        BEGIN
            CREATE EXTENSION IF NOT EXISTS vector;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'ib-automation-hub: skipping vector extension: %', SQLERRM;
        END;
        $pgv$;
        """
    )

    op.execute("""
    CREATE TABLE IF NOT EXISTS dashboard_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        max_channels INTEGER,
        max_ai_tokens_per_month INTEGER,
        max_scheduled_posts INTEGER
    )
    """)

    op.execute("ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS max_channels INTEGER")
    op.execute("ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS max_ai_tokens_per_month INTEGER")
    op.execute("ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS max_scheduled_posts INTEGER")

    op.execute("""
    CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'telegram',
        encrypted_bot_token TEXT NOT NULL,
        token_hint TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        target_language TEXT,
        timezone TEXT,
        broker_info JSONB,
        ai_auto_reply BOOLEAN NOT NULL DEFAULT FALSE,
        owner_id TEXT REFERENCES dashboard_users(id) ON DELETE SET NULL
    )
    """)

    op.execute("ALTER TABLE channels ADD COLUMN IF NOT EXISTS target_language TEXT")
    op.execute("ALTER TABLE channels ADD COLUMN IF NOT EXISTS timezone TEXT")
    op.execute("ALTER TABLE channels ADD COLUMN IF NOT EXISTS broker_info JSONB")
    op.execute("ALTER TABLE channels ADD COLUMN IF NOT EXISTS ai_auto_reply BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE channels ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES dashboard_users(id) ON DELETE SET NULL")

    op.execute("""
    CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        entry DOUBLE PRECISION NOT NULL,
        sl DOUBLE PRECISION NOT NULL,
        tp DOUBLE PRECISION NOT NULL,
        action TEXT NOT NULL,
        raw_json JSONB,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS signal_logs (
        id TEXT PRIMARY KEY,
        signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        error TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS telethon_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api_id INTEGER NOT NULL,
        api_hash TEXT NOT NULL,
        encrypted_session TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS source_channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        telethon_account_id TEXT NOT NULL REFERENCES telethon_accounts(id) ON DELETE CASCADE,
        telegram_chat_id TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS forward_rules (
        id TEXT PRIMARY KEY,
        source_channel_id TEXT NOT NULL REFERENCES source_channels(id) ON DELETE CASCADE,
        destination_channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_forward_rule "
        "ON forward_rules (source_channel_id, destination_channel_id)"
    )

    op.execute("""
    CREATE TABLE IF NOT EXISTS scheduled_contents (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_personas (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        tone TEXT NOT NULL,
        knowledge_base TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (channel_id)
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS usage_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES dashboard_users(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL,
        details JSONB,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS telegram_client_sessions (
        id TEXT PRIMARY KEY,
        session_name TEXT NOT NULL UNIQUE,
        session_str TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """)

    op.execute(
        """
        DO $kc$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
                EXECUTE $sql$
                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                    id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    embedding vector(1536),
                    metadata JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                $sql$;
            ELSE
                EXECUTE $sql$
                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                    id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    embedding TEXT,
                    metadata JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                $sql$;
            END IF;
        END;
        $kc$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS knowledge_chunks CASCADE")
    op.execute("DROP TABLE IF EXISTS telegram_client_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS usage_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS ai_personas CASCADE")
    op.execute("DROP TABLE IF EXISTS scheduled_contents CASCADE")
    op.execute("DROP TABLE IF EXISTS forward_rules CASCADE")
    op.execute("DROP TABLE IF EXISTS source_channels CASCADE")
    op.execute("DROP TABLE IF EXISTS telethon_accounts CASCADE")
    op.execute("DROP TABLE IF EXISTS signal_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS signals CASCADE")
    op.execute("DROP TABLE IF EXISTS channels CASCADE")
    op.execute("DROP TABLE IF EXISTS dashboard_users CASCADE")
