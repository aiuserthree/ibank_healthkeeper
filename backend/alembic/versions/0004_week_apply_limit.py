"""주당 회원 1타임 신청 제한 (부분 유니크)

Revision ID: 0004_week_apply_limit
Revises: 0003_sso
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_week_apply_limit"
down_revision = "0003_sso"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 기존 중복 신청/확정 건 정리 — 주차·회원당 1건만 유지 (가장 이른 applied_at)
    op.execute(
        sa.text(
            """
            UPDATE reservation r
            SET status = 'CANCELLED', cancelled_at = NOW()
            WHERE r.status IN ('REQUESTED', 'CONFIRMED')
              AND r.id NOT IN (
                SELECT DISTINCT ON (cycle_id, member_id) id
                FROM reservation
                WHERE status IN ('REQUESTED', 'CONFIRMED')
                ORDER BY cycle_id, member_id, applied_at ASC, id ASC
              )
            """
        )
    )
    op.create_index(
        "uq_reservation_cycle_member_active_apply",
        "reservation",
        ["cycle_id", "member_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('REQUESTED', 'CONFIRMED')"),
    )


def downgrade() -> None:
    op.drop_index("uq_reservation_cycle_member_active_apply", table_name="reservation")
