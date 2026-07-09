from __future__ import annotations

"""transfer request + reservation/teams enums

Revision ID: 0014_transfer
Revises: 0013_korean_public_holiday
Create Date: 2026-07-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_transfer"
down_revision: Union[str, None] = "0013_korean_public_holiday"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN CREATE TYPE transferrequeststatus AS ENUM "
        "('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;"
    )
    op.execute("ALTER TYPE reservationtype ADD VALUE IF NOT EXISTS 'TRANSFER'")
    op.execute("ALTER TYPE confirmedby ADD VALUE IF NOT EXISTS 'TRANSFER'")
    op.execute(
        "ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'TRANSFER_REQUEST_ADMIN'"
    )
    op.execute(
        "ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'TRANSFER_APPROVED'"
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "transfer_request" in inspector.get_table_names():
        return

    op.create_table(
        "transfer_request",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("reservation_id", sa.BigInteger(), nullable=False),
        sa.Column("donor_member_id", sa.BigInteger(), nullable=False),
        sa.Column("recipient_member_id", sa.BigInteger(), nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=False),
        sa.Column("slot_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING",
                "APPROVED",
                "REJECTED",
                name="transferrequeststatus",
                create_type=False,
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("new_reservation_id", sa.BigInteger(), nullable=True),
        sa.Column("resolved_by_admin_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["cycle_id"], ["reservation_cycle.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["donor_member_id"], ["member.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["new_reservation_id"], ["reservation.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["recipient_member_id"], ["member.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservation.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["resolved_by_admin_id"], ["admin_user.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["slot_id"], ["slot.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transfer_status", "transfer_request", ["status"])
    op.create_index(
        "ix_transfer_cycle_status", "transfer_request", ["cycle_id", "status"]
    )
    op.create_index(
        "uq_transfer_pending_reservation",
        "transfer_request",
        ["reservation_id"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )


def downgrade() -> None:
    op.drop_index("uq_transfer_pending_reservation", table_name="transfer_request")
    op.drop_index("ix_transfer_cycle_status", table_name="transfer_request")
    op.drop_index("ix_transfer_status", table_name="transfer_request")
    op.drop_table("transfer_request")
    op.execute("DROP TYPE transferrequeststatus")
