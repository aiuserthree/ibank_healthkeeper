from __future__ import annotations

"""점심 라운지 게임 기록

Revision ID: 0023_game_play
Revises: 0022_health_scheduled_2026_11
Create Date: 2026-10-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023_game_play"
down_revision: Union[str, None] = "0022_health_scheduled_2026_11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_play",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("member_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("game", sa.String(30), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("played_on", sa.Date(), nullable=False),
        sa.Column("played_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_game_play_game_day", "game_play", ["game", "played_on"])
    op.create_index("ix_game_play_member_game", "game_play", ["member_id", "game"])


def downgrade() -> None:
    op.drop_index("ix_game_play_member_game", table_name="game_play")
    op.drop_index("ix_game_play_game_day", table_name="game_play")
    op.drop_table("game_play")
