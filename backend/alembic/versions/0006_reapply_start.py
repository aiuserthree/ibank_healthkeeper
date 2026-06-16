from __future__ import annotations

"""reapply start settings + cycle.reapply_open_at

Revision ID: 0006_reapply_start
Revises: 0005_member_dept_position
Create Date: 2026-06-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_reapply_start"
down_revision: Union[str, None] = "0005_member_dept_position"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reservation_cycle",
        sa.Column("reapply_open_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE reservation_cycle
            SET reapply_open_at = close_at + interval '16 hours'
            WHERE reapply_open_at IS NULL
            """
        )
    )
    op.alter_column("reservation_cycle", "reapply_open_at", nullable=False)

    op.execute(
        sa.text(
            """
            INSERT INTO operation_setting (setting_key, setting_value, description, updated_at)
            VALUES
                ('reapply.start.dow', 'THU', '재신청 시작 요일', NOW()),
                ('reapply.start.time', '09:00', '재신청 시작 시각', NOW())
            ON CONFLICT (setting_key) DO UPDATE SET
                setting_value = EXCLUDED.setting_value,
                updated_at = NOW()
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM operation_setting WHERE setting_key IN ('reapply.start.dow', 'reapply.start.time')"
        )
    )
    op.drop_column("reservation_cycle", "reapply_open_at")
