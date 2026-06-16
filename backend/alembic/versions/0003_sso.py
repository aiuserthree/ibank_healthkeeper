from __future__ import annotations

"""SSO: member entra_oid + nullable password_hash

Revision ID: 0003_sso
Revises: 0002_seed
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_sso"
down_revision: Union[str, None] = "0002_seed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("member", sa.Column("entra_oid", sa.String(64), nullable=True))
    op.alter_column("member", "password_hash", existing_type=sa.String(255), nullable=True)
    op.create_index(
        "uq_member_entra_oid_active",
        "member",
        ["entra_oid"],
        unique=True,
        postgresql_where=sa.text("entra_oid IS NOT NULL AND status <> 'WITHDRAWN'"),
    )


def downgrade() -> None:
    op.drop_index("uq_member_entra_oid_active", table_name="member")
    op.alter_column("member", "password_hash", existing_type=sa.String(255), nullable=False)
    op.drop_column("member", "entra_oid")
