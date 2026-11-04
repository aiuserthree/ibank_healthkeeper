from __future__ import annotations

"""대전 게임 Teams 알림 타입 — 신청 · 수락 · 거절 · 신청 취소

Revision ID: 0030_match_notice
Revises: 0029_reservation_return
Create Date: 2026-11-04
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0030_match_notice"
down_revision: Union[str, None] = "0029_reservation_return"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VALUES = ("MATCH_CHALLENGED", "MATCH_ACCEPTED", "MATCH_DECLINED", "MATCH_CANCELLED")


def upgrade() -> None:
    for value in VALUES:
        op.execute(f"ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL enum 값은 되돌리지 않는다.
    pass
