from __future__ import annotations

"""게임 기록 갈래(상식 퀴즈 분야)

Revision ID: 0026_game_play_variant
Revises: 0025_game_request
Create Date: 2026-10-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0026_game_play_variant"
down_revision: Union[str, None] = "0025_game_request"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("game_play", sa.Column("variant", sa.String(20), server_default="", nullable=False))


def downgrade() -> None:
    op.drop_column("game_play", "variant")
