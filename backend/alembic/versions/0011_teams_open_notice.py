from __future__ import annotations

"""teams_message type RESERVE_OPEN_NOTICE

Revision ID: 0011_teams_open_notice
Revises: 0010_admin_assign
Create Date: 2026-07-01
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0011_teams_open_notice"
down_revision: Union[str, None] = "0010_admin_assign"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'RESERVE_OPEN_NOTICE'"
    )


def downgrade() -> None:
    pass
