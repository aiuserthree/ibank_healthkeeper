from __future__ import annotations

"""swap proposal + teams message types

Revision ID: 0016_swap_proposal
Revises: 0015_confirm_mode_auto
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_swap_proposal"
down_revision: Union[str, None] = "0015_confirm_mode_auto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN CREATE TYPE swapproposalstatus AS ENUM "
        "('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'FAILED'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$;"
    )
    for value in (
        "SWAP_PROPOSED",
        "SWAP_REJECTED",
        "SWAP_ACCEPTED",
        "SWAP_ACCEPT_FAILED",
        "SWAP_CANCELLED",
    ):
        op.execute(
            f"ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS '{value}'"
        )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_proposal" in inspector.get_table_names():
        return

    op.create_table(
        "swap_proposal",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=False),
        sa.Column("proposer_member_id", sa.BigInteger(), nullable=False),
        sa.Column("target_member_id", sa.BigInteger(), nullable=False),
        sa.Column("proposer_reservation_id", sa.BigInteger(), nullable=False),
        sa.Column("target_reservation_id", sa.BigInteger(), nullable=False),
        sa.Column("proposer_slot_id", sa.BigInteger(), nullable=False),
        sa.Column("target_slot_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING",
                "ACCEPTED",
                "REJECTED",
                "CANCELLED",
                "FAILED",
                name="swapproposalstatus",
                create_type=False,
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("fail_reason", sa.String(length=64), nullable=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["cycle_id"], ["reservation_cycle.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["proposer_member_id"], ["member.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_member_id"], ["member.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["proposer_reservation_id"], ["reservation.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_reservation_id"], ["reservation.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["proposer_slot_id"], ["slot.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_slot_id"], ["slot.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_swap_pending_proposer_res",
        "swap_proposal",
        ["proposer_reservation_id"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )
    op.create_index(
        "uq_swap_pending_target_res",
        "swap_proposal",
        ["target_reservation_id"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )
    op.create_index(
        "ix_swap_target_status", "swap_proposal", ["target_member_id", "status"]
    )
    op.create_index(
        "ix_swap_proposer_status",
        "swap_proposal",
        ["proposer_member_id", "status"],
    )
    op.create_index(
        "ix_swap_cycle_status", "swap_proposal", ["cycle_id", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_swap_cycle_status", table_name="swap_proposal")
    op.drop_index("ix_swap_proposer_status", table_name="swap_proposal")
    op.drop_index("ix_swap_target_status", table_name="swap_proposal")
    op.drop_index("uq_swap_pending_target_res", table_name="swap_proposal")
    op.drop_index("uq_swap_pending_proposer_res", table_name="swap_proposal")
    op.drop_table("swap_proposal")
    op.execute("DROP TYPE swapproposalstatus")
