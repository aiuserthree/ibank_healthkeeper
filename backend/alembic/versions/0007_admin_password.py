from __future__ import annotations

"""update default admin password

Revision ID: 0007_admin_password
Revises: 0006_reapply_start
Create Date: 2026-06-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext

revision: str = "0007_admin_password"
down_revision: Union[str, None] = "0006_reapply_start"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    admin_hash = pwd.hash("ibank1234!@#$")
    op.execute(
        sa.text(
            "UPDATE admin_user SET password_hash = :hash WHERE login_id = 'admin'"
        ).bindparams(hash=admin_hash)
    )


def downgrade() -> None:
    old_hash = pwd.hash("admin1234")
    op.execute(
        sa.text(
            "UPDATE admin_user SET password_hash = :hash WHERE login_id = 'admin'"
        ).bindparams(hash=old_hash)
    )
