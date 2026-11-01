from __future__ import annotations

"""직원·컴퓨터 턴제 대전(오목)

Revision ID: 0028_game_match
Revises: 0027_game_request_kind
Create Date: 2026-11-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0028_game_match"
down_revision: Union[str, None] = "0027_game_request_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_match",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("game", sa.String(30), nullable=False),
        sa.Column("challenger_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("opponent_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=True),
        sa.Column("bot", sa.String(10), nullable=True),
        sa.Column("black_id", sa.BigInteger(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("moves", sa.JSON(), nullable=False),
        sa.Column("winner_id", sa.BigInteger(), nullable=True),
        sa.Column("end_reason", sa.String(20), nullable=True),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_game_match_challenger", "game_match", ["challenger_id", "status"])
    op.create_index("ix_game_match_opponent", "game_match", ["opponent_id", "status"])
    op.create_index("ix_game_match_game_status", "game_match", ["game", "status"])


def downgrade() -> None:
    op.drop_table("game_match")
