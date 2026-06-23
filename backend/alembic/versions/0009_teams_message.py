from __future__ import annotations

"""teams_message table for Teams chat reminders

Revision ID: 0009_teams_message
Revises: 0008_legacy_usage
Create Date: 2026-06-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0009_teams_message"
down_revision: Union[str, None] = "0008_legacy_usage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

teamsmessagetype = postgresql.ENUM(
    "RESERVE_REMINDER",
    name="teamsmessagetype",
    create_type=False,
)
mailstatus = postgresql.ENUM(
    "PENDING",
    "SENDING",
    "SENT",
    "FAILED",
    "DEAD",
    name="mailstatus",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE teamsmessagetype AS ENUM ('RESERVE_REMINDER');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.create_table(
        "teams_message",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("type", teamsmessagetype, nullable=False),
        sa.Column("to_member_id", sa.BigInteger(), nullable=True),
        sa.Column("to_entra_oid", sa.String(64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            mailstatus,
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dedupe_key", sa.String(255), nullable=True),
        sa.Column("reservation_id", sa.BigInteger(), nullable=True),
        sa.Column("chat_id", sa.String(128), nullable=True),
        sa.Column("last_tried_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["to_member_id"], ["member.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservation.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index("ix_teams_status", "teams_message", ["status"])
    op.create_index(
        "ix_teams_retry_scan",
        "teams_message",
        ["status", "retry_count", "last_tried_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_teams_retry_scan", table_name="teams_message")
    op.drop_index("ix_teams_status", table_name="teams_message")
    op.drop_table("teams_message")
    op.execute("DROP TYPE IF EXISTS teamsmessagetype")
