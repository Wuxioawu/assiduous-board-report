import uuid
from typing import Literal

from app.schemas.base import AppBaseModel

ChartType = Literal["line", "grouped_bar", "stacked_bar", "waterfall", "card", "milestone"]
ChartFormat = Literal["currency", "percent", "ratio", "count", "months"]


class SourceRef(AppBaseModel):
    """Traces a single chart point back to the exact FinancialStatement row(s)
    it was computed from, so the frontend can show provenance on click (e.g.
    clicking the Revenue card shows the "Turnover 354,813" excerpt it came
    from) - see CLAUDE.md's audit-trail requirement. A point derived from more
    than one taxonomy code (e.g. a margin %, or a waterfall step that's itself
    a sum) carries one SourceRef per contributing statement."""

    statement_id: uuid.UUID
    taxonomy_code: str
    source_excerpt: str | None
    source_page: int | None


class ChartPoint(AppBaseModel):
    # x-axis category for "line"/"grouped_bar"/"stacked_bar" (a period label -
    # see frontend lib/periods.formatPeriodLabel, built from the fields below
    # rather than a pre-formatted string so the frontend's shared formatter
    # is still the only thing that turns it into display text); the waterfall
    # step name for "waterfall", or the event name for "milestone".
    period_start: str | None = None
    period_end: str | None = None
    period_type: str | None = None
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
    step_label: str | None = None
    # One-line free text for a "milestone" point (e.g. the source excerpt
    # describing the event) - not used by other chart_types.
    description: str | None = None
    value: float
    source_refs: list[SourceRef]


class ChartSeries(AppBaseModel):
    label: str
    points: list[ChartPoint]


class ChartConfig(AppBaseModel):
    id: str
    display_name: str
    chart_type: ChartType
    audiences: list[str]
    format: ChartFormat
    # Free-text note rendered alongside the chart/card (e.g. ebitda_margin's
    # "FY2028 breakeven target" annotation) - None for the common case of no
    # annotation. Deliberately a single string, not a structured target
    # object: every current use is a short one-line caption, not something a
    # chart needs to plot.
    annotation: str | None = None
    series: list[ChartSeries]
