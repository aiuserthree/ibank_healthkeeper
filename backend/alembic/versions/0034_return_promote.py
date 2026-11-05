from __future__ import annotations

"""반납 자리 자동 확정 — 확정 경로 구분값(confirmedby: RETURN_PROMOTE)

Revision ID: 0034_return_promote
Revises: 0033_match_state
Create Date: 2026-11-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0034_return_promote"
down_revision: Union[str, None] = "0033_match_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE confirmedby ADD VALUE IF NOT EXISTS 'RETURN_PROMOTE'")


def downgrade() -> None:
    # PostgreSQL enum 값은 되돌리지 않는다.
    pass
