from __future__ import annotations

"""공지사항 + 팀즈 서비스 공지 타입 + 첫 공지(무적 쿠폰 안내)

Revision ID: 0018_notice
Revises: 0017_coupon
Create Date: 2026-10-15
"""

from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_notice"
down_revision: Union[str, None] = "0017_coupon"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED = Path(__file__).resolve().parents[2] / "data" / "notices" / "2026-10-coupon.md"


def upgrade() -> None:
    op.execute("ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'SERVICE_NOTICE'")

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "notice" in inspector.get_table_names():
        return
    notice = op.create_table(
        "notice",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notice_published_at", "notice", ["published", "published_at"])

    if SEED.is_file():
        lines = SEED.read_text(encoding="utf-8").strip().split("\n")
        title = lines[0].lstrip("# ").strip()
        body = "\n".join(lines[1:]).strip()
        op.bulk_insert(notice, [{"title": title, "body": body, "pinned": True, "published": True}])


def downgrade() -> None:
    op.drop_index("ix_notice_published_at", table_name="notice")
    op.drop_table("notice")
