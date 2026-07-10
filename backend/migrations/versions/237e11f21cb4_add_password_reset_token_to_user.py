"""add password reset token to user

Revision ID: 237e11f21cb4
Revises: 4639bd4425ac
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '237e11f21cb4'
down_revision: Union[str, None] = '4639bd4425ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user', sa.Column('password_reset_token', sa.String(length=255), nullable=True))
    op.add_column(
        'user', sa.Column('password_reset_token_expires_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        op.f('ix_user_password_reset_token'), 'user', ['password_reset_token'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_user_password_reset_token'), table_name='user')
    op.drop_column('user', 'password_reset_token_expires_at')
    op.drop_column('user', 'password_reset_token')
