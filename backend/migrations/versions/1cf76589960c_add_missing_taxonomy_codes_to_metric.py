"""add missing taxonomy codes to metric

Revision ID: 1cf76589960c
Revises: c90997760daf
Create Date: 2026-07-08 11:08:58.216736

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1cf76589960c'
down_revision: Union[str, None] = 'c90997760daf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "metric",
        sa.Column("missing_taxonomy_codes", sa.ARRAY(sa.String(length=100)), nullable=True),
    )
    # `metric` is purely a cache of financial_statement, recomputed lazily by
    # get_or_compute_metrics (see orchestrator.py) whenever the cached row set doesn't
    # match METRIC_REGISTRY's keys. This release changes what's computed for *existing*
    # keys (adding missing_taxonomy_codes) without adding new keys, so that staleness
    # check wouldn't catch it - every previously-cached row would permanently read back
    # missing_taxonomy_codes=NULL otherwise. Wiping the cache forces a one-time recompute.
    op.execute("DELETE FROM metric")


def downgrade() -> None:
    op.drop_column("metric", "missing_taxonomy_codes")
