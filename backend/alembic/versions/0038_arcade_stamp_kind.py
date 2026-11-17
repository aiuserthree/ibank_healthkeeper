from __future__ import annotations

"""참여 도장 종류 — 대전 승리 보너스(하루 최대 2개: 일반 1 + 대전 승리 1)

arcade_stamp 에 kind(PLAY · WIN) · ref(판정 근거 판) · rivals(이긴 상대 회원 id) 칸을 더하고,
하루 한 줄 유일 제약 (회원, 날짜) 를 (회원, 날짜, 종류) 로 바꾼다. 기존 기록은 모두 PLAY(일반).

Revision ID: 0038_arcade_stamp_kind
Revises: 0037_game_party
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0038_arcade_stamp_kind"
down_revision: Union[str, None] = "0037_game_party"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("arcade_stamp") as batch:
        batch.add_column(sa.Column("kind", sa.String(10), nullable=False, server_default="PLAY"))
        batch.add_column(sa.Column("ref", sa.String(40), nullable=True))
        batch.add_column(sa.Column("rivals", sa.String(200), nullable=True))
        batch.drop_constraint("uq_arcade_stamp_member_day", type_="unique")
        batch.create_unique_constraint("uq_arcade_stamp_member_day_kind", ["member_id", "stamp_date", "kind"])


def downgrade() -> None:
    # 하루 한 줄로 되돌리기 전에 대전 승리 보너스 도장을 지운다 (남기면 옛 유일 제약에 걸린다)
    op.execute("DELETE FROM arcade_stamp WHERE kind <> 'PLAY'")
    with op.batch_alter_table("arcade_stamp") as batch:
        batch.drop_constraint("uq_arcade_stamp_member_day_kind", type_="unique")
        batch.create_unique_constraint("uq_arcade_stamp_member_day", ["member_id", "stamp_date"])
        batch.drop_column("rivals")
        batch.drop_column("ref")
        batch.drop_column("kind")
