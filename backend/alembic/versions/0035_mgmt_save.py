from __future__ import annotations

"""매일 키우는 운영 게임 저장 — mgmt_save (회원 · 게임마다 한 줄)

Revision ID: 0035_mgmt_save
Revises: 0034_return_promote
Create Date: 2026-11-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0035_mgmt_save"
down_revision: Union[str, None] = "0034_return_promote"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mgmt_save",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("member_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("game", sa.String(20), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resets", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("member_id", "game", name="uq_mgmt_save_member_game"),
    )
    op.create_index("ix_mgmt_save_game", "mgmt_save", ["game"])


def downgrade() -> None:
    op.drop_index("ix_mgmt_save_game", table_name="mgmt_save")
    op.drop_table("mgmt_save")
