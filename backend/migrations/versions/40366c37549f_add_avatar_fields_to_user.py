"""add avatar fields to user

Revision ID: 40366c37549f
Revises: 1cf76589960c
Create Date: 2026-07-08 17:24:23.665217

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '40366c37549f'
down_revision: Union[str, None] = '1cf76589960c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    op.add_column("user", sa.Column("avatar_storage_path", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "avatar_storage_path")
    op.drop_column("user", "avatar_url")
