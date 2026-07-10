"""add company logo fields

Revision ID: 57f9d17e6244
Revises: 2b24e07bc8fc
Create Date: 2026-07-08 23:13:09.786279

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '57f9d17e6244'
down_revision: Union[str, None] = '2b24e07bc8fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("company", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("company", sa.Column("logo_storage_path", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("company", "logo_storage_path")
    op.drop_column("company", "logo_url")
