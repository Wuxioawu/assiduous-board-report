"""add not meaningful flag to metric

Revision ID: c75ace7ccfae
Revises: a570c57a5654
Create Date: 2026-07-13 17:01:14.461131

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c75ace7ccfae'
down_revision: Union[str, None] = 'a570c57a5654'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'metric',
        sa.Column('not_meaningful', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.alter_column('metric', 'not_meaningful', server_default=None)


def downgrade() -> None:
    op.drop_column('metric', 'not_meaningful')
