"""add insight manual edit fields

Revision ID: 1d93edf5b782
Revises: 771bc280131d
Create Date: 2026-07-09 12:11:09.493530

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1d93edf5b782'
down_revision: Union[str, None] = '771bc280131d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "insight", sa.Column("edited_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )
    op.add_column(
        "insight", sa.Column("is_edited", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.alter_column("insight", "is_edited", server_default=None)
    op.add_column("insight", sa.Column("edited_by_user_id", sa.UUID(), nullable=True))
    op.add_column("insight", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_insight_edited_by_user_id",
        "insight",
        "user",
        ["edited_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_insight_edited_by_user_id", "insight", type_="foreignkey")
    op.drop_column("insight", "edited_at")
    op.drop_column("insight", "edited_by_user_id")
    op.drop_column("insight", "is_edited")
    op.drop_column("insight", "edited_content")
