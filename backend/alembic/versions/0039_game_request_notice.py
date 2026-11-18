from __future__ import annotations

"""아케이드 게임 요청 Teams 알림 타입 — 요청이 들어오면 운영자에게 1:1 알림

Revision ID: 0039_game_request_notice
Revises: 0038_arcade_stamp_kind
Create Date: 2026-11-18
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0039_game_request_notice"
down_revision: Union[str, None] = "0038_arcade_stamp_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VALUES = ("GAME_REQUEST",)


def upgrade() -> None:
    for value in VALUES:
        op.execute(f"ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL enum 값은 되돌리지 않는다.
    pass
