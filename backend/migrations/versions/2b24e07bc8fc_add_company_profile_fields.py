"""add company profile fields

Revision ID: 2b24e07bc8fc
Revises: ab77f61d9f70
Create Date: 2026-07-08 22:52:06.131966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b24e07bc8fc'
down_revision: Union[str, None] = 'ab77f61d9f70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("company", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("company", sa.Column("founded_date", sa.Date(), nullable=True))
    op.add_column("company", sa.Column("website_url", sa.String(length=2000), nullable=True))
    op.add_column("company", sa.Column("headquarters_location", sa.String(length=255), nullable=True))
    op.add_column("company", sa.Column("employee_count_range", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("company", "employee_count_range")
    op.drop_column("company", "headquarters_location")
    op.drop_column("company", "website_url")
    op.drop_column("company", "founded_date")
    op.drop_column("company", "description")
