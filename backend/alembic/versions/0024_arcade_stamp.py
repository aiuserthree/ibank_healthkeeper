from __future__ import annotations

"""아케이드 참여 도장

Revision ID: 0024_arcade_stamp
Revises: 0023_game_play
Create Date: 2026-10-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_arcade_stamp"
down_revision: Union[str, None] = "0023_game_play"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "arcade_stamp",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("member_id", sa.BigInteger(), sa.ForeignKey("member.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stamp_date", sa.Date(), nullable=False),
        sa.Column("game", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("member_id", "stamp_date", name="uq_arcade_stamp_member_day"),
    )


def downgrade() -> None:
    op.drop_table("arcade_stamp")
