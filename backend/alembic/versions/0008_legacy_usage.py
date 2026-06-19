from __future__ import annotations

"""legacy_usage table for pre-system reservation history

Revision ID: 0008_legacy_usage
Revises: 0007_admin_password
Create Date: 2026-06-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008_legacy_usage"
down_revision: Union[str, None] = "0007_admin_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "legacy_usage",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("email_local", sa.String(100), nullable=True),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("usage_start_time", sa.String(10), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="2026_schedule"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_legacy_usage_email", "legacy_usage", ["email"])
    op.create_index("ix_legacy_usage_email_local", "legacy_usage", ["email_local"])
    op.create_index("ix_legacy_usage_name", "legacy_usage", ["name"])
    op.create_index("ix_legacy_usage_usage_date", "legacy_usage", ["usage_date"])


def downgrade() -> None:
    op.drop_index("ix_legacy_usage_usage_date", table_name="legacy_usage")
    op.drop_index("ix_legacy_usage_name", table_name="legacy_usage")
    op.drop_index("ix_legacy_usage_email_local", table_name="legacy_usage")
    op.drop_index("ix_legacy_usage_email", table_name="legacy_usage")
    op.drop_table("legacy_usage")
