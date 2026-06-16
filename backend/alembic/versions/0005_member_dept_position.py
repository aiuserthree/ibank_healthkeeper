from __future__ import annotations

"""member department + position columns

Revision ID: 0005_member_dept_position
Revises: 0004_week_apply_limit
Create Date: 2026-06-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_member_dept_position"
down_revision: Union[str, None] = "0004_week_apply_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("member", sa.Column("department", sa.String(100), nullable=True))
    op.add_column("member", sa.Column("position", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("member", "position")
    op.drop_column("member", "department")
