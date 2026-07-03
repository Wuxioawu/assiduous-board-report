"""restructure financial statement for line item extraction

Revision ID: 881bb165afd0
Revises: d1bfd9cf946f
Create Date: 2026-07-03 12:17:09.006256

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '881bb165afd0'
down_revision: Union[str, None] = 'd1bfd9cf946f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('document', sa.Column('error_message', sa.Text(), nullable=True))

    op.add_column('financial_statement', sa.Column('taxonomy_code', sa.String(length=100), nullable=False))
    op.add_column('financial_statement', sa.Column('value', sa.Numeric(precision=20, scale=4), nullable=False))
    op.add_column(
        'financial_statement', sa.Column('confidence_score', sa.Numeric(precision=3, scale=2), nullable=True)
    )
    op.add_column('financial_statement', sa.Column('source_excerpt', sa.Text(), nullable=True))
    op.add_column('financial_statement', sa.Column('source_page', sa.Integer(), nullable=True))
    op.add_column('financial_statement', sa.Column('extracted_by', sa.String(length=20), nullable=False))
    op.create_index(
        op.f('ix_financial_statement_taxonomy_code'), 'financial_statement', ['taxonomy_code'], unique=False
    )

    op.drop_column('financial_statement', 'raw_data')
    op.drop_column('financial_statement', 'statement_type')
    op.execute('DROP TYPE IF EXISTS statement_type')


def downgrade() -> None:
    op.add_column(
        'financial_statement',
        sa.Column(
            'statement_type',
            sa.Enum('INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW', name='statement_type'),
            nullable=False,
        ),
    )
    op.add_column(
        'financial_statement',
        sa.Column('raw_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )

    op.drop_index(op.f('ix_financial_statement_taxonomy_code'), table_name='financial_statement')
    op.drop_column('financial_statement', 'extracted_by')
    op.drop_column('financial_statement', 'source_page')
    op.drop_column('financial_statement', 'source_excerpt')
    op.drop_column('financial_statement', 'confidence_score')
    op.drop_column('financial_statement', 'value')
    op.drop_column('financial_statement', 'taxonomy_code')

    op.drop_column('document', 'error_message')
