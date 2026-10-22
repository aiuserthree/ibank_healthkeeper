from __future__ import annotations

"""팀즈 재신청 안내 메시지 타입 (목 08:55, 빈 슬롯이 있는 주의 탈락자) + 탈락 메일 기본 문구

Revision ID: 0019_teams_reapply_notice
Revises: 0018_notice
Create Date: 2026-10-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_teams_reapply_notice"
down_revision: Union[str, None] = "0018_notice"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD_DROP_PLAIN = (
    "안녕하세요, {이름}님.\n"
    "신청하신 시간대는 우선권(마지막 이용일)에 따라 다른 분께 확정되어 탈락 처리되었습니다. "
    "아래 비어있는 슬롯에 선착순으로 재신청하실 수 있어요."
)
NEW_DROP_PLAIN = (
    "안녕하세요, {이름}님.\n"
    "신청하신 시간대는 우선권(마지막 이용일)에 따라 다른 분께 확정되어 탈락 처리되었습니다. "
    "아래 비어있는 슬롯에 {재신청시작}부터 선착순으로 재신청하실 수 있어요."
)


def upgrade() -> None:
    op.execute("ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'REAPPLY_NOTICE'")
    # 탈락 메일이 수 17:00에 나가므로 본문에 재신청 시작 시각을 넣는다 — 관리자가 고치지 않은 기본 문구일 때만
    op.get_bind().execute(
        sa.text(
            "UPDATE mail_template SET body_template = :new "
            "WHERE type = 'DROP_REAPPLY_NOTICE' AND body_template = :old"
        ),
        {"new": NEW_DROP_PLAIN, "old": OLD_DROP_PLAIN},
    )


def downgrade() -> None:
    # PostgreSQL enum 값은 되돌리지 않는다.
    pass
