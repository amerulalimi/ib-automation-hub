"""scheduled_contents: post_kind + post_meta for photo/poll.

Revision ID: b9c1d2e3f4a5
Revises: 2a3b4c5d6e7f
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op

revision: str = "b9c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "2a3b4c5d6e7f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE scheduled_contents ADD COLUMN IF NOT EXISTS post_kind TEXT NOT NULL DEFAULT 'text'"
    )
    op.execute(
        "ALTER TABLE scheduled_contents ADD COLUMN IF NOT EXISTS post_meta JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE scheduled_contents DROP COLUMN IF EXISTS post_meta")
    op.execute("ALTER TABLE scheduled_contents DROP COLUMN IF EXISTS post_kind")
