from __future__ import annotations

"""Fix operation open.dow + recompute reservation_cycle schedule times

Revision ID: 0012_cycle_open_wed
Revises: 0011_teams_open_notice
Create Date: 2026-07-01
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0012_cycle_open_wed"
down_revision: Union[str, None] = "0011_teams_open_notice"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE operation_setting
        SET setting_value = 'WED'
        WHERE setting_key = 'open.dow'
          AND setting_value IS DISTINCT FROM 'WED'
        """
    )
    # open_at/close_at/reapply_* 는 배포 후 scripts/recompute-cycle-times.py 로 갱신


def downgrade() -> None:
    pass
