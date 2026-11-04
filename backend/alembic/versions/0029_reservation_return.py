from __future__ import annotations

"""회원 본인 반납 — 반납 시각 + 관리자 Teams 알림 타입

Revision ID: 0029_reservation_return
Revises: 0028_game_match
Create Date: 2026-11-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0029_reservation_return"
down_revision: Union[str, None] = "0028_game_match"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reservation",
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_reservation_member_returned_at",
        "reservation",
        ["member_id", "returned_at"],
        postgresql_where=sa.text("returned_at IS NOT NULL"),
    )
    op.execute("ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'RESERVATION_RETURNED'")


def downgrade() -> None:
    op.drop_index("ix_reservation_member_returned_at", table_name="reservation")
    op.drop_column("reservation", "returned_at")
    # PostgreSQL enum 값은 되돌리지 않는다.
