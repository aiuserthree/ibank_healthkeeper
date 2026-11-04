from __future__ import annotations

"""대전 판 칸 — 숫자 야구 · 칸 따먹기 · 1:1 퀴즈 대결 같은 대전 엔진 게임의 판(JSON). 오목 · 체스는 비어 있다

Revision ID: 0033_match_state
Revises: 0032_coop_score
Create Date: 2026-11-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0033_match_state"
down_revision: Union[str, None] = "0032_coop_score"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("game_match", sa.Column("state", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("game_match", "state")
