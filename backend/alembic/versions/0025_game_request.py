from __future__ import annotations

"""아케이드 게임 요청

Revision ID: 0025_game_request
Revises: 0024_arcade_stamp
Create Date: 2026-10-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025_game_request"
down_revision: Union[str, None] = "0024_arcade_stamp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_request",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("member_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="NEW", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_game_request_created", "game_request", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_game_request_created", table_name="game_request")
    op.drop_table("game_request")
