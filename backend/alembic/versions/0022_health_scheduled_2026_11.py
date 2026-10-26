from __future__ import annotations

"""건강 정보 11월 4편 — 매주 화요일 09:00 게시 예약

Revision ID: 0022_health_scheduled_2026_11
Revises: 0021_notice_category_health
Create Date: 2026-10-26
"""

from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022_health_scheduled_2026_11"
down_revision: Union[str, None] = "0021_notice_category_health"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KST = timezone(timedelta(hours=9))
# 파일명 앞 날짜(YYYY-MM-DD)의 09:00 KST에 공개
SCHEDULED_DIR = Path(__file__).resolve().parents[2] / "data" / "health" / "scheduled"
PATTERN = "2026-11-*.md"


def _titles() -> list[str]:
    return [p.read_text(encoding="utf-8").split("\n", 1)[0].lstrip("# ").strip() for p in sorted(SCHEDULED_DIR.glob(PATTERN))]


def upgrade() -> None:
    bind = op.get_bind()
    for path in sorted(SCHEDULED_DIR.glob(PATTERN)):
        lines = path.read_text(encoding="utf-8").strip().split("\n")
        title = lines[0].lstrip("# ").strip()
        body = "\n".join(lines[1:]).strip()
        at = datetime.combine(date.fromisoformat(path.name[:10]), time(9, 0), tzinfo=KST)
        exists = bind.execute(
            sa.text("SELECT 1 FROM notice WHERE title = :t AND category = 'HEALTH'"), {"t": title}
        ).first()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO notice (title, body, category, pinned, published, published_at, updated_at) "
                "VALUES (:title, :body, 'HEALTH', false, true, :at, now())"
            ),
            {"title": title, "body": body, "at": at},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for title in _titles():
        bind.execute(sa.text("DELETE FROM notice WHERE title = :t AND category = 'HEALTH'"), {"t": title})
