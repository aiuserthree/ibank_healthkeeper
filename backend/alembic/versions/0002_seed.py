from __future__ import annotations

"""seed defaults

Revision ID: 0002_seed
Revises: 0001_initial
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext

revision: str = "0002_seed"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

SETTINGS = [
    ("open.dow", "WED", "예약 오픈 요일"),
    ("open.time", "09:00", "예약 오픈 시각"),
    ("close.time", "17:00", "마감 시각"),
    ("reapply.close.dow", "THU", "재신청 마감 요일"),
    ("reapply.close.time", "17:00", "재신청 마감 시각"),
    ("reapply.start.dow", "THU", "재신청 시작 요일"),
    ("reapply.start.time", "09:00", "재신청 시작 시각"),
    (
        "slot.times",
        '[{"i":1,"s":"13:30","e":"14:00"},{"i":2,"s":"14:30","e":"15:00"},{"i":3,"s":"15:30","e":"16:00"},{"i":4,"s":"16:30","e":"17:00"}]',
        "슬롯 구성 JSON",
    ),
    ("confirm.mode", "AUTO", "확정 모드 MANUAL|AUTO"),
    ("verify.token.ttlHours", "24", "인증 토큰 TTL"),
    ("mail.retry.max", "3", "메일 최대 재시도"),
]

TEMPLATES = [
    (
        "EMAIL_VERIFY",
        "헬스키퍼 이메일 인증",
        "안녕하세요 {name}님,\n\n아래 링크를 클릭해 이메일 인증을 완료해 주세요.\n{verifyUrl}\n\n24시간 내에 인증해 주세요.",
    ),
    (
        "RESERVE_DONE_NORMAL",
        "[헬스키퍼] 예약이 확정되었습니다",
        "{name}님, 예약이 확정되었습니다.\n\n일시: {slotDate} {slotTime}\n\n이용해 주셔서 감사합니다.",
    ),
    (
        "RESERVE_DONE_REAPPLY",
        "[헬스키퍼] 재신청 예약이 확정되었습니다",
        "{name}님, 재신청 예약이 확정되었습니다.\n\n일시: {slotDate} {slotTime}\n\n재신청 건은 취소할 수 없습니다.",
    ),
    (
        "DROP_REAPPLY_NOTICE",
        "[헬스키퍼] 탈락 안내 및 재신청 가능 슬롯 안내",
        "{name}님, 우선권 경합으로 이번 신청이 탈락되었습니다.\n\n빈 슬롯: {emptySlots}\n재신청 시작: {reapplyOpenAt}부터 선착순·즉시 확정\n재신청 마감: {reapplyDeadline}\n· 재신청 건은 취소할 수 없습니다.",
    ),
]


def upgrade() -> None:
    admin_hash = pwd.hash("ibank1234!@#$")
    settings_table = sa.table(
        "operation_setting",
        sa.column("setting_key", sa.String),
        sa.column("setting_value", sa.String),
        sa.column("description", sa.String),
    )
    op.bulk_insert(
        settings_table,
        [
            {"setting_key": k, "setting_value": v, "description": d}
            for k, v, d in SETTINGS
        ],
    )

    template_table = sa.table(
        "mail_template",
        sa.column("type", sa.String),
        sa.column("subject_template", sa.String),
        sa.column("body_template", sa.Text),
    )
    for t, s, b in TEMPLATES:
        op.execute(
            sa.text(
                "INSERT INTO mail_template (type, subject_template, body_template) "
                "VALUES (CAST(:mail_type AS mailtype), :subject, :body) "
                "ON CONFLICT (type) DO NOTHING"
            ).bindparams(mail_type=t, subject=s, body=b)
        )

    op.execute(
        sa.text(
            """
            INSERT INTO admin_user (login_id, password_hash, name, role, is_active)
            VALUES ('admin', :hash, '관리자', 'ADMIN', true)
            ON CONFLICT (login_id) DO NOTHING
            """
        ).bindparams(hash=admin_hash)
    )


def downgrade() -> None:
    op.execute("DELETE FROM admin_user WHERE login_id = 'admin'")
    op.execute("DELETE FROM mail_template")
    op.execute("DELETE FROM operation_setting")
