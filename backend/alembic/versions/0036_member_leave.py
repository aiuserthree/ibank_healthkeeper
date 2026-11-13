from __future__ import annotations

"""회원 휴가 — member_leave (그룹웨어 휴가 · 반차 · 반반차 · 특별휴가 → 쉬는 시간대에 아케이드 열기)

Revision ID: 0036_member_leave
Revises: 0035_mgmt_save
Create Date: 2026-11-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0036_member_leave"
down_revision: Union[str, None] = "0035_mgmt_save"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "member_leave",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("member_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("start_min", sa.SmallInteger(), nullable=False),
        sa.Column("end_min", sa.SmallInteger(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("source", sa.String(10), nullable=False, server_default="GW"),
        sa.Column("doc", sa.String(40), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("start_min >= 0 AND end_min <= 1440 AND start_min < end_min", name="ck_member_leave_minutes"),
    )
    op.create_index("ix_member_leave_day_member", "member_leave", ["day", "member_id"])


def downgrade() -> None:
    op.drop_index("ix_member_leave_day_member", table_name="member_leave")
    op.drop_table("member_leave")
