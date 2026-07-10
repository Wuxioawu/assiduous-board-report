"""add invitation_type to invitation

Revision ID: ab77f61d9f70
Revises: 40366c37549f
Create Date: 2026-07-08 17:46:08.074060

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab77f61d9f70'
down_revision: Union[str, None] = '40366c37549f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


invitation_type_enum = sa.Enum("NEW_USER", "TRANSFER", name="invitation_type")


def upgrade() -> None:
    invitation_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "invitation",
        sa.Column(
            "invitation_type", invitation_type_enum, nullable=False, server_default="NEW_USER"
        ),
    )
    op.alter_column("invitation", "invitation_type", server_default=None)


def downgrade() -> None:
    op.drop_column("invitation", "invitation_type")
    invitation_type_enum.drop(op.get_bind(), checkfirst=True)
