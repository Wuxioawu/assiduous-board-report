"""rename document status pending extracted

Revision ID: d1bfd9cf946f
Revises: 6a0d750a3f42
Create Date: 2026-07-03 12:01:58.253435

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1bfd9cf946f'
down_revision: Union[str, None] = '6a0d750a3f42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE document_status RENAME VALUE 'UPLOADED' TO 'PENDING'")
    op.execute("ALTER TYPE document_status RENAME VALUE 'PROCESSED' TO 'EXTRACTED'")


def downgrade() -> None:
    op.execute("ALTER TYPE document_status RENAME VALUE 'PENDING' TO 'UPLOADED'")
    op.execute("ALTER TYPE document_status RENAME VALUE 'EXTRACTED' TO 'PROCESSED'")
