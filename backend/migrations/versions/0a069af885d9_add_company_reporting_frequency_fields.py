"""add company reporting frequency fields

Revision ID: 0a069af885d9
Revises: 1d93edf5b782
Create Date: 2026-07-09 13:16:40.424231

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0a069af885d9'
down_revision: Union[str, None] = '1d93edf5b782'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

reporting_frequency_enum = postgresql.ENUM(
    'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', name='reporting_frequency'
)


def upgrade() -> None:
    reporting_frequency_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'company',
        sa.Column('reporting_frequency', reporting_frequency_enum, nullable=True),
    )
    # server_default backfills existing rows to calendar-year (month 1), then is
    # dropped so future inserts rely on the ORM-level default instead - same
    # pattern as insight.is_edited in the prior migration.
    op.add_column(
        'company',
        sa.Column('fiscal_year_start_month', sa.Integer(), nullable=False, server_default='1'),
    )
    op.alter_column('company', 'fiscal_year_start_month', server_default=None)


def downgrade() -> None:
    op.drop_column('company', 'fiscal_year_start_month')
    op.drop_column('company', 'reporting_frequency')
    reporting_frequency_enum.drop(op.get_bind(), checkfirst=True)
