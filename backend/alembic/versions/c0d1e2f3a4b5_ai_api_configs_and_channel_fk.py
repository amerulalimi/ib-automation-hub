"""ai_api_configs table and channels.ai_api_config_id FK.

Revision ID: c0d1e2f3a4b5
Revises: b9c1d2e3f4a5
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op

revision: str = "c0d1e2f3a4b5"
down_revision: Union[str, Sequence[str], None] = "b9c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_api_configs (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'openai',
            base_url TEXT,
            encrypted_api_key TEXT NOT NULL,
            api_key_hint TEXT NOT NULL DEFAULT '',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ai_api_configs_owner_id ON ai_api_configs (owner_id)"
    )
    op.execute(
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS ai_api_config_id TEXT "
        "REFERENCES ai_api_configs(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE channels DROP COLUMN IF EXISTS ai_api_config_id"
    )
    op.execute("DROP TABLE IF EXISTS ai_api_configs CASCADE")
