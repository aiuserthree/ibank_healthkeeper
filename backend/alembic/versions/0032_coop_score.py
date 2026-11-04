from __future__ import annotations

"""협동 방 점수 칸 — 점심 분식집 매출

Revision ID: 0032_coop_score
Revises: 0031_escape_room
Create Date: 2026-11-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0032_coop_score"
down_revision: Union[str, None] = "0031_escape_room"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("escape_room", sa.Column("score", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("escape_room", "score")
