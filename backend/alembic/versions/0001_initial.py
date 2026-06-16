from __future__ import annotations

"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "member",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "ACTIVE", "WITHDRAWN", name="memberstatus"),
            nullable=False,
        ),
        sa.Column("last_used_date", sa.Date(), nullable=True),
        sa.Column("login_fail_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_member_email_active",
        "member",
        ["email"],
        unique=True,
        postgresql_where=sa.text("status <> 'WITHDRAWN'"),
    )
    op.create_index("ix_member_last_used_date", "member", ["last_used_date"])
    op.create_index("ix_member_status", "member", ["status"])

    op.create_table(
        "admin_user",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("login_id", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "role",
            sa.Enum("ADMIN", "SUPER", name="adminrole"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("login_id"),
    )

    op.create_table(
        "operation_setting",
        sa.Column("setting_key", sa.String(100), nullable=False),
        sa.Column("setting_value", sa.String(500), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("setting_key"),
    )

    op.create_table(
        "mail_template",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "EMAIL_VERIFY",
                "RESERVE_DONE_NORMAL",
                "RESERVE_DONE_REAPPLY",
                "DROP_REAPPLY_NOTICE",
                name="mailtype",
            ),
            nullable=False,
        ),
        sa.Column("subject_template", sa.String(255), nullable=False),
        sa.Column("body_template", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("type"),
    )

    op.create_table(
        "reservation_cycle",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("target_week_start", sa.Date(), nullable=False),
        sa.Column("target_week_end", sa.Date(), nullable=False),
        sa.Column("open_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("close_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reapply_close_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "state",
            sa.Enum("BEFORE_OPEN", "OPEN", "REAPPLY", "CLOSED", name="cyclestate"),
            nullable=False,
        ),
        sa.Column("batch_close_done", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reapply_closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("target_week_start"),
    )
    op.create_index("ix_cycle_state", "reservation_cycle", ["state"])
    op.create_index("ix_cycle_open_at", "reservation_cycle", ["open_at"])

    op.create_table(
        "email_verification_token",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("member_id", sa.BigInteger(), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["member_id"], ["member.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_email_token_member_id", "email_verification_token", ["member_id"])
    op.create_index("ix_email_token_expires_at", "email_verification_token", ["expires_at"])

    op.create_table(
        "vacation",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=False),
        sa.Column("vacation_date", sa.Date(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["cycle_id"], ["reservation_cycle.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["admin_user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_vacation_cycle_date", "vacation", ["cycle_id", "vacation_date"], unique=True)

    op.create_table(
        "slot",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=False),
        sa.Column("slot_date", sa.Date(), nullable=False),
        sa.Column("time_index", sa.SmallInteger(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("is_vacation", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "status",
            sa.Enum("OPEN", "CONFIRMED", name="slotstatus"),
            nullable=False,
        ),
        sa.Column("confirmed_reservation_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["cycle_id"], ["reservation_cycle.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("confirmed_reservation_id"),
    )
    op.create_index("uq_slot_cycle_date_time", "slot", ["cycle_id", "slot_date", "time_index"], unique=True)
    op.create_index("ix_slot_cycle_date", "slot", ["cycle_id", "slot_date"])
    op.create_index("ix_slot_status", "slot", ["status"])

    op.create_table(
        "reservation",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("slot_id", sa.BigInteger(), nullable=False),
        sa.Column("member_id", sa.BigInteger(), nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("NORMAL", "REAPPLY", name="reservationtype"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("REQUESTED", "CONFIRMED", "DROPPED", "CANCELLED", name="reservationstatus"),
            nullable=False,
        ),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dropped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "confirmed_by",
            sa.Enum("ADMIN", "SYSTEM", "REAPPLY", name="confirmedby"),
            nullable=True,
        ),
        sa.Column("is_priority", sa.Boolean(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["cycle_id"], ["reservation_cycle.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["member.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["slot_id"], ["slot.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_foreign_key(
        "fk_slot_confirmed_reservation",
        "slot",
        "reservation",
        ["confirmed_reservation_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )
    op.create_index(
        "uq_reservation_slot_confirmed",
        "reservation",
        ["slot_id"],
        unique=True,
        postgresql_where=sa.text("status = 'CONFIRMED'"),
    )
    op.create_index(
        "uq_reservation_slot_member_active",
        "reservation",
        ["slot_id", "member_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'CANCELLED'"),
    )
    op.create_index("ix_reservation_slot_status", "reservation", ["slot_id", "status"])
    op.create_index("ix_reservation_cycle_status", "reservation", ["cycle_id", "status"])
    op.create_index("ix_reservation_member_status", "reservation", ["member_id", "status"])
    op.create_index("ix_reservation_applied_at", "reservation", ["applied_at"])

    op.create_table(
        "mail_message",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("type", sa.Enum(name="mailtype", create_type=False), nullable=False),
        sa.Column("to_member_id", sa.BigInteger(), nullable=True),
        sa.Column("to_email", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "SENDING", "SENT", "FAILED", "DEAD", name="mailstatus"),
            nullable=False,
        ),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("dedupe_key", sa.String(255), nullable=True),
        sa.Column("reservation_id", sa.BigInteger(), nullable=True),
        sa.Column("cycle_id", sa.BigInteger(), nullable=True),
        sa.Column("last_tried_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservation.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["to_member_id"], ["member.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index("ix_mail_status", "mail_message", ["status"])
    op.create_index("ix_mail_retry_scan", "mail_message", ["status", "retry_count", "last_tried_at"])


def downgrade() -> None:
    op.drop_table("mail_message")
    op.drop_table("reservation")
    op.drop_constraint("fk_slot_confirmed_reservation", "slot", type_="foreignkey")
    op.drop_table("slot")
    op.drop_table("vacation")
    op.drop_table("email_verification_token")
    op.drop_table("reservation_cycle")
    op.drop_table("mail_template")
    op.drop_table("operation_setting")
    op.drop_table("admin_user")
    op.drop_table("member")
    for name in (
        "mailstatus", "confirmedby", "reservationstatus", "reservationtype",
        "slotstatus", "cyclestate", "mailtype", "adminrole", "memberstatus",
    ):
        op.execute(f"DROP TYPE IF EXISTS {name}")
