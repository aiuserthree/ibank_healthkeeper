from __future__ import annotations

"""2인 협동 방탈출 + 초대 Teams 알림 타입

Revision ID: 0031_escape_room
Revises: 0030_match_notice
Create Date: 2026-11-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0031_escape_room"
down_revision: Union[str, None] = "0030_match_notice"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TEAMS_TYPES = ("ESCAPE_INVITED", "ESCAPE_ACCEPTED", "ESCAPE_DECLINED", "ESCAPE_CANCELLED", "ESCAPE_CALL")


def upgrade() -> None:
    op.create_table(
        "escape_room",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("room", sa.String(20), nullable=False),
        sa.Column("host_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("guest_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("record_sec", sa.Integer(), nullable=True),
        sa.Column("ranked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_escape_room_host", "escape_room", ["host_id", "status"])
    op.create_index("ix_escape_room_guest", "escape_room", ["guest_id", "status"])
    op.create_index("ix_escape_room_status", "escape_room", ["status"])
    for value in TEAMS_TYPES:
        op.execute(f"ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    op.drop_table("escape_room")
    # PostgreSQL enum 값은 되돌리지 않는다.
