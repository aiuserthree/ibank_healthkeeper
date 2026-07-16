from __future__ import annotations

"""Set confirm.mode default to AUTO for batch auto-confirm

Revision ID: 0015_confirm_mode_auto
Revises: 0014_transfer
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015_confirm_mode_auto"
down_revision: Union[str, None] = "0014_transfer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO operation_setting (setting_key, setting_value, description, updated_at)
            VALUES ('confirm.mode', 'AUTO', '확정 모드 MANUAL|AUTO', NOW())
            ON CONFLICT (setting_key) DO UPDATE SET
                setting_value = 'AUTO',
                description = EXCLUDED.description,
                updated_at = NOW()
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE operation_setting
            SET setting_value = 'MANUAL', updated_at = NOW()
            WHERE setting_key = 'confirm.mode'
            """
        )
    )
