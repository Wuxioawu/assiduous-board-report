"""add structured_content to insight

Revision ID: 771bc280131d
Revises: 57f9d17e6244
Create Date: 2026-07-09 00:10:41.056719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '771bc280131d'
down_revision: Union[str, None] = '57f9d17e6244'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "insight", sa.Column("structured_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("insight", "structured_content")
