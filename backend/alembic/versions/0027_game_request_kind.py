from __future__ import annotations

"""아케이드 의견 종류 · 게임 · 기기

Revision ID: 0027_game_request_kind
Revises: 0026_game_play_variant
Create Date: 2026-10-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0027_game_request_kind"
down_revision: Union[str, None] = "0026_game_play_variant"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("game_request", sa.Column("kind", sa.String(10), server_default="GAME", nullable=False))
    op.add_column("game_request", sa.Column("game", sa.String(30), nullable=True))
    op.add_column("game_request", sa.Column("device", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("game_request", "device")
    op.drop_column("game_request", "game")
    op.drop_column("game_request", "kind")
