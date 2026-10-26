from __future__ import annotations

"""공지 게시판에 카테고리(공지/건강 정보) 추가 + 건강 정보 첫 글 6편

Revision ID: 0021_notice_category_health
Revises: 0020_cycle_reapply_skipped
Create Date: 2026-10-26
"""

from datetime import timedelta
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_notice_category_health"
down_revision: Union[str, None] = "0020_cycle_reapply_skipped"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

HEALTH_DIR = Path(__file__).resolve().parents[2] / "data" / "health"


def upgrade() -> None:
    op.add_column(
        "notice",
        sa.Column("category", sa.String(20), nullable=False, server_default="NOTICE"),
    )

    bind = op.get_bind()
    now = bind.execute(sa.text("SELECT now()")).scalar_one()
    files = sorted(HEALTH_DIR.glob("*.md"))
    # 파일 순서대로 목록 위에 오도록 — 첫 글이 가장 최근
    for i, path in enumerate(files):
        lines = path.read_text(encoding="utf-8").strip().split("\n")
        title = lines[0].lstrip("# ").strip()
        body = "\n".join(lines[1:]).strip()
        exists = bind.execute(
            sa.text("SELECT 1 FROM notice WHERE title = :t AND category = 'HEALTH'"), {"t": title}
        ).first()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO notice (title, body, category, pinned, published, published_at, updated_at) "
                "VALUES (:title, :body, 'HEALTH', false, true, :at, :at)"
            ),
            {"title": title, "body": body, "at": now - timedelta(minutes=i)},
        )


def downgrade() -> None:
    op.execute("DELETE FROM notice WHERE category = 'HEALTH'")
    op.drop_column("notice", "category")
