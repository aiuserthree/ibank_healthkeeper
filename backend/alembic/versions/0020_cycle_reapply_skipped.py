from __future__ import annotations

"""재신청할 빈 슬롯이 없는 주는 목요일 재신청을 열지 않음 (reservation_cycle.reapply_skipped)

Revision ID: 0020_cycle_reapply_skipped
Revises: 0019_teams_reapply_notice
Create Date: 2026-10-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020_cycle_reapply_skipped"
down_revision: Union[str, None] = "0019_teams_reapply_notice"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reservation_cycle",
        sa.Column("reapply_skipped", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("reservation_cycle", "reapply_skipped")
