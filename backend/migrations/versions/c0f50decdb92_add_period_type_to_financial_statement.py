"""add period_type to financial statement

Revision ID: c0f50decdb92
Revises: 0a069af885d9
Create Date: 2026-07-13 12:10:41.047524

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c0f50decdb92'
down_revision: Union[str, None] = '0a069af885d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

period_type_enum = postgresql.ENUM('FY', 'HY', 'Q', name='period_type')

# Mirrors app.services.metrics.fiscal_periods.classify_period_type's day-span
# thresholds exactly, so a row backfilled here and a row validated by that
# function post-migration are classified identically.
_BACKFILL_SQL = """
    UPDATE financial_statement
    SET period_type = (CASE
        WHEN (period_end - period_start) <= 100 THEN 'Q'
        WHEN (period_end - period_start) <= 200 THEN 'HY'
        ELSE 'FY'
    END)::period_type
"""


def upgrade() -> None:
    period_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'financial_statement',
        sa.Column('period_type', period_type_enum, nullable=True),
    )
    op.execute(_BACKFILL_SQL)
    op.alter_column('financial_statement', 'period_type', nullable=False)


def downgrade() -> None:
    op.drop_column('financial_statement', 'period_type')
    period_type_enum.drop(op.get_bind(), checkfirst=True)
