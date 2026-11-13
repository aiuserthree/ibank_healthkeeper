from __future__ import annotations

"""여러 명 대전 — game_party · game_party_seat (선다운 범퍼스 대전 최대 6명 경주)

Revision ID: 0037_game_party
Revises: 0036_member_leave
Create Date: 2026-11-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0037_game_party"
down_revision: Union[str, None] = "0036_member_leave"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_party",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("game", sa.String(30), nullable=False),
        sa.Column("host_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("state", sa.JSON(), nullable=True),
        sa.Column("winner_id", sa.BigInteger(), nullable=True),
        sa.Column("end_reason", sa.String(20), nullable=True),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_game_party_game_status", "game_party", ["game", "status"])
    op.create_table(
        "game_party_seat",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("party_id", sa.BigInteger(), sa.ForeignKey("game_party.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("party_id", "member_id", name="uq_game_party_seat"),
    )
    op.create_index("ix_game_party_seat_member", "game_party_seat", ["member_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_game_party_seat_member", table_name="game_party_seat")
    op.drop_table("game_party_seat")
    op.drop_index("ix_game_party_game_status", table_name="game_party")
    op.drop_table("game_party")
