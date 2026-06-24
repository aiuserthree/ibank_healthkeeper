from __future__ import annotations

"""admin_assign reservation type

Revision ID: 0010_admin_assign
Revises: 0009_teams_message
Create Date: 2026-06-24
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0010_admin_assign"
down_revision: Union[str, None] = "0009_teams_message"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE reservationtype ADD VALUE IF NOT EXISTS 'ADMIN_ASSIGN'")


def downgrade() -> None:
    pass
