import uuid

from sqlalchemy import ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPKMixin


class IndustryBenchmark(UUIDPKMixin, CreatedAtMixin, Base):
    """A manually-curated peer/industry-average figure for one metric, used to
    show "vs. industry" comparisons on top of a company's own actuals (see
    api/v1/routes/metrics.py). Organization-wide reference data, not tied to
    any one company - many companies in the same industry share these rows.

    This is deliberately a manual-curation MVP: no paid data provider (Capital
    IQ, PitchBook, etc.) is integrated yet. `source` must cite where the figure
    actually came from - never a fabricated citation - and stays empty/omitted
    from display if a real benchmark isn't available for a given industry/metric.
    """

    __tablename__ = "industry_benchmark"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "industry", "metric_key", "period_label", name="uq_benchmark_org_industry_metric_period"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    industry: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # A METRIC_REGISTRY key (e.g. "gross_margin", "ebitda_margin", "roce") -
    # industry comparisons only make sense for margins/ratios, not raw currency
    # totals that vary wildly with company size (see services/metrics/registry.py).
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    period_label: Mapped[str] = mapped_column(String(50), nullable=False)
    benchmark_value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
