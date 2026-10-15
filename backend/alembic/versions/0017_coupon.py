from __future__ import annotations

"""무적 쿠폰 — coupon 테이블 + reservation.coupon_id

Revision ID: 0017_coupon
Revises: 0016_swap_proposal
Create Date: 2026-10-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_coupon"
down_revision: Union[str, None] = "0016_swap_proposal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "coupon" not in inspector.get_table_names():
        op.create_table(
            "coupon",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("member_id", sa.BigInteger(), nullable=False),
            sa.Column("source", sa.String(length=16), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="AVAILABLE"),
            sa.Column("grant_month", sa.String(length=7), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("note", sa.String(length=200), nullable=True),
            sa.Column(
                "issued_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["member_id"], ["member.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_coupon_member_status", "coupon", ["member_id", "status"])
        op.create_index("ix_coupon_member_source", "coupon", ["member_id", "source", "grant_month"])

    columns = {c["name"] for c in inspector.get_columns("reservation")}
    if "coupon_id" not in columns:
        op.add_column("reservation", sa.Column("coupon_id", sa.BigInteger(), nullable=True))
        op.create_foreign_key(
            "fk_reservation_coupon", "reservation", "coupon", ["coupon_id"], ["id"], ondelete="SET NULL"
        )
        op.create_index("ix_reservation_coupon", "reservation", ["coupon_id"])


def downgrade() -> None:
    op.drop_index("ix_reservation_coupon", table_name="reservation")
    op.drop_constraint("fk_reservation_coupon", "reservation", type_="foreignkey")
    op.drop_column("reservation", "coupon_id")
    op.drop_index("ix_coupon_member_source", table_name="coupon")
    op.drop_index("ix_coupon_member_status", table_name="coupon")
    op.drop_table("coupon")
