from __future__ import annotations

"""korean_public_holiday table for 공공데이터포털 공휴일 API sync

Revision ID: 0013_korean_public_holiday
Revises: 0012_cycle_open_wed
Create Date: 2026-07-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_korean_public_holiday"
down_revision: Union[str, None] = "0012_cycle_open_wed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "korean_public_holiday",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("date_name", sa.String(length=100), nullable=False),
        sa.Column("sol_year", sa.Integer(), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_korean_public_holiday_date",
        "korean_public_holiday",
        ["holiday_date"],
        unique=True,
    )
    op.create_index(
        "ix_korean_public_holiday_sol_year",
        "korean_public_holiday",
        ["sol_year"],
    )


def downgrade() -> None:
    op.drop_index("ix_korean_public_holiday_sol_year", table_name="korean_public_holiday")
    op.drop_index("uq_korean_public_holiday_date", table_name="korean_public_holiday")
    op.drop_table("korean_public_holiday")
