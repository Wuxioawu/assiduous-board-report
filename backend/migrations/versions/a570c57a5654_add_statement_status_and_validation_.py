"""add statement status and validation result table

Revision ID: a570c57a5654
Revises: c0f50decdb92
Create Date: 2026-07-13 15:54:35.048780

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a570c57a5654'
down_revision: Union[str, None] = 'c0f50decdb92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

statement_status_enum = postgresql.ENUM('CONFIRMED', 'NEEDS_REVIEW', name='statement_status')


def upgrade() -> None:
    statement_status_enum.create(op.get_bind(), checkfirst=True)
    # server_default backfills every existing row to 'CONFIRMED' (nothing
    # extracted before ValidationService existed has been through it, but
    # treating pre-existing data as needs_review by default would silently
    # empty out every chart on upgrade) - dropped after, same pattern as
    # company.fiscal_year_start_month's migration, so future inserts rely on
    # the ORM-level default instead. Uppercase to match how SQLAlchemy's
    # Enum() column type serializes a str-mixin Python enum by default (the
    # member NAME, not .value - see period_type/reporting_frequency's own
    # Postgres enum labels for the same convention already in this codebase).
    op.add_column(
        'financial_statement',
        sa.Column('status', statement_status_enum, nullable=False, server_default='CONFIRMED'),
    )
    op.alter_column('financial_statement', 'status', server_default=None)

    op.create_table(
        'validation_result',
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('statement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('rule_name', sa.String(length=100), nullable=False),
        sa.Column('passed', sa.Boolean(), nullable=False),
        sa.Column('expected_value', sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column('actual_value', sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column('delta', sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['statement_id'], ['financial_statement.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_validation_result_organization_id'), 'validation_result', ['organization_id'])
    op.create_index(op.f('ix_validation_result_statement_id'), 'validation_result', ['statement_id'])
    op.create_index(op.f('ix_validation_result_rule_name'), 'validation_result', ['rule_name'])


def downgrade() -> None:
    op.drop_index(op.f('ix_validation_result_rule_name'), table_name='validation_result')
    op.drop_index(op.f('ix_validation_result_statement_id'), table_name='validation_result')
    op.drop_index(op.f('ix_validation_result_organization_id'), table_name='validation_result')
    op.drop_table('validation_result')

    op.drop_column('financial_statement', 'status')
    statement_status_enum.drop(op.get_bind(), checkfirst=True)
