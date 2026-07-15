import enum
from datetime import date

import anthropic
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.request_timing import atimed
from app.models.enums import PeriodType
from app.services.extraction.pdf_parser import PageText
from app.services.extraction.taxonomy import TAXONOMY

# Bump manually whenever the extraction prompt/schema below changes in a way
# that could shift extracted values - stamped onto every AccuracyReport (see
# services/accuracy_report.py) so a mismatch spike can be correlated with a
# specific prompt change instead of looking like unexplained drift.
EXTRACTION_PIPELINE_VERSION = "v1"


class UnitScale(str, enum.Enum):
    """The scale a figure appears in within the SOURCE document, before any
    normalization - a filing that tables its figures under a "€'000s" heading
    reports "355" meaning 355,000, not 355. Kept currency-agnostic (ONE/
    THOUSANDS/MILLIONS rather than EUR/EUR_k/EUR_m) since this platform is
    multi-currency by design (see FinancialStatement.currency) - the scale a
    filing uses is independent of which currency it's denominated in."""

    ONE = "ONE"
    THOUSANDS = "THOUSANDS"
    MILLIONS = "MILLIONS"


UNIT_SCALE_MULTIPLIER: dict[UnitScale, int] = {
    UnitScale.ONE: 1,
    UnitScale.THOUSANDS: 1_000,
    UnitScale.MILLIONS: 1_000_000,
}


class ExtractedLineItem(BaseModel):
    taxonomy_code: str
    # The raw figure exactly as it appears in the source document - NOT
    # pre-converted to full units. unit_in_source + value together are
    # normalized to full-currency-unit integers downstream (see
    # pipeline.normalize_to_full_units) before storage, so every stored
    # FinancialStatement.value is directly comparable regardless of how the
    # source document itself scaled its own tables.
    value: float
    unit_in_source: UnitScale
    currency: str
    period_start: date
    period_end: date
    # Read directly from how the document itself describes the reporting
    # period (e.g. "Half Year Results for the 6 months ended...") rather than
    # inferred from period_start/period_end - see the system prompt below and
    # services/metrics/fiscal_periods.classify_period_type, which pipeline.py
    # uses as a non-blocking sanity check against this value.
    period_type: PeriodType
    confidence: float = Field(ge=0, le=1)
    source_excerpt: str
    source_page: int | None = None


class ExtractionResult(BaseModel):
    line_items: list[ExtractedLineItem]


def _taxonomy_listing() -> str:
    return "\n".join(
        f"- {entry.code}: {entry.display_name} (category={entry.category.value}, "
        f"expected_unit={entry.expected_unit.value})"
        for entry in TAXONOMY.values()
    )


_SYSTEM_PROMPT = f"""You are a financial data extraction engine for a board reporting platform. \
You are given the raw text of a company's financial filing, extracted page by page from a PDF.

Extract values for the following standardized line-item taxonomy wherever they appear in the document:

{_taxonomy_listing()}

Rules:
- Only extract a taxonomy code if the document text explicitly supports a value for it. If a field \
cannot be found, omit it entirely from your output - never guess, estimate, or hallucinate a value.
- An explicit zero IS a value - if a table cell literally shows "0" or "-" meaning nil for a period \
(e.g. "Payments to acquire tangible assets ... 0"), extract it as value=0.0 with confidence reflecting how \
explicit it is. Do not omit a field just because its value happens to be zero - omission is only for when \
the document doesn't address the field at all, which is a different thing from stating it's nil.
- DEBT_SERVICE ideally covers BOTH interest and principal due in the period. Many interim/half-year \
filings only disclose interest paid, with no separate principal-repayment schedule - in that common case, \
extract the interest-paid figure alone as DEBT_SERVICE (it's the standard practical proxy analysts use for \
an interim DSCR when a full debt-service schedule isn't disclosed), but set confidence lower (around 0.6) \
to reflect that it's a partial figure, and note in source_excerpt that it's interest-only. Only omit \
DEBT_SERVICE entirely if neither interest nor principal is stated anywhere.
- TOTAL_DEBT means interest-bearing borrowings only - typically a line like "Creditors: amounts falling \
due after more than one year" when that balance is bank/loan debt (check the notes if unclear whether it's \
debt vs. other long-term liabilities). Do NOT include CONTINGENT_CONSIDERATION (an M&A earn-out, not a \
loan) or ordinary trade creditors due within a year (that's CURRENT_LIABILITIES) in TOTAL_DEBT.
- CAPITAL_EXPENDITURE, DEBT_SERVICE, and CONTINGENT_CONSIDERATION are always positive magnitudes (the \
amount spent/owed) regardless of how the source document signs them - a cash flow statement typically \
shows capital expenditure as a negative outflow (e.g. "-8,500"); extract that as value=8500, not -8500. \
Likewise a balance sheet typically shows contingent consideration as a negative deduction (e.g. \
"Contingent consideration -850,000"); extract that as value=850000. This is the opposite convention from \
CASH_OPENING/NET_OPERATING_CASH_FLOW/NET_INVESTING_CASH_FLOW/NET_FINANCING_CASH_FLOW/CASH_CLOSING below, \
which must keep the document's own sign (a negative net cash outflow stays negative) since they're summed \
directly in an accounting identity that only balances if the signs are preserved.
- DEPRECIATION is usually only visible inside the cash flow statement's reconciliation of loss/profit to \
operating cash flow (e.g. a line simply labeled "Depreciation" under "Adjustments for:"), not broken out \
as its own P&L line - extract it from there.
- NEW_EQUITY_RAISED is the cash flow statement's "Issue of new shares" (or similarly worded) line within \
financing activities - a component already summed into NET_FINANCING_CASH_FLOW, but extract it separately \
too since it's independently useful.
- SHARES_OUTSTANDING is typically disclosed in a "Listing Statistics"/"Share Capital" style box (often near \
the front of an announcement, separate from the main financial statement tables) - e.g. "Issued Share \
Capital: 2,561,332". It has no currency; still populate the currency field with the company's reporting \
currency for consistency (same as CUSTOMER_COUNT).
- For each extracted field, include a verbatim excerpt (at most ~200 characters) quoted directly from \
the document text that supports the value, and the page number it came from.
- confidence is a number between 0 and 1 reflecting how directly the document text supports the value \
(1.0 for an explicit, unambiguous figure; lower for a value that required interpretation).
- period_start/period_end describe the reporting period the value applies to (e.g. a fiscal year or \
half-year), as ISO dates.
- period_type identifies what kind of period this is - "FY" for a full year, "HY" for a half year \
(6 months), or "Q" for a quarter (3 months). Determine this from how the document itself describes the \
period (e.g. a filing titled "Half Year Results for the 6 months ended 31 December 2025" is period_type \
"HY", NOT a full year or a Q4 quarter just because its period_end falls in Q4 of the calendar year - \
never infer period_type from the calendar quarter/month of period_end alone).
- MANDATORY: every statement table in interim/half-year filings has TWO columns - the current period and \
a prior-period comparative (e.g. "Six months to 31-Dec-25" AND "Six months to 31-Dec-24" side by side in \
the same table). You MUST extract BOTH columns as separate line items with separate period_start/period_end \
- never extract only the first/current column and skip the comparative one. A table with two number columns \
means you emit TWO ExtractedLineItem entries per row (one per column), each with its own period_start/ \
period_end/source_excerpt pointing at that column's own number. This applies to every taxonomy code that \
has a comparative column, not just REVENUE - go through the P&L, balance sheet, and cash flow statement \
tables column by column, not just their left-most column.
- currency is the 3-letter ISO currency code the value is denominated in.
- CUSTOMER_COUNT has no currency; still populate the currency field with the company's reporting \
currency for consistency.
- unit_in_source identifies the scale the SOURCE document itself uses for this figure - "ONE" if the \
table/text already shows full units (e.g. "354,813" or "Turnover 354,813"), "THOUSANDS" if the figure is \
under a scale heading like "€'000" or "(in thousands)" (e.g. a table showing "355" under such a heading), \
"MILLIONS" for a "€m"/"(in millions)" heading. value should be the raw number exactly as printed in the \
source - do NOT pre-convert it to full units yourself; report the scale separately via unit_in_source \
instead. Most narrative/highlights text abbreviates for readability (e.g. "€354.8k" in a summary \
paragraph) - always extract from the actual financial statement TABLES, not narrative highlights, and use \
the table's own unit_in_source, not the narrative's.
- NET_ASSETS is the balance sheet's own "Net Assets" (or "Net (liabilities)/Assets") subtotal - extract it \
even though it should equal TOTAL_EQUITY, since checking the two independently-stated figures agree is \
exactly how extraction errors get caught (never derive one from the other yourself).
- CASH_OPENING/NET_OPERATING_CASH_FLOW/NET_INVESTING_CASH_FLOW/NET_FINANCING_CASH_FLOW/CASH_CLOSING are \
the cash flow statement's own headline subtotals (e.g. "Net Cash used in operating activities", "Cash and \
cash equivalent at beginning/end of period") - extract each directly from the cash flow statement, never \
computed or inferred from other figures. CASH_CLOSING is the cash flow statement's own "cash at end of \
period" line specifically - extract it even though it should equal CASH_AND_EQUIVALENTS (the balance \
sheet's figure for the same period_end), since checking the two independently-stated figures agree is \
exactly how extraction errors get caught (never derive one from the other yourself).
"""


def _render_document_text(pages: list[PageText]) -> str:
    return "\n\n".join(f"[Page {p.page_number}]\n{p.text}" for p in pages)


async def extract_financial_data(pages: list[PageText]) -> list[ExtractedLineItem]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    document_text = _render_document_text(pages)
    async with atimed("llm"):
        response = await client.messages.parse(
            model=settings.extraction_model,
            max_tokens=8000,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": document_text}],
            output_format=ExtractionResult,
        )

    line_items = response.parsed_output.line_items
    for item in line_items:
        item.source_excerpt = item.source_excerpt[:200]
    return line_items


def normalize_to_full_units(item: ExtractedLineItem) -> float:
    """Converts a raw extracted value to a full-currency-unit whole number,
    using the scale the source document itself reported it in (see
    UnitScale) - e.g. value=354.8, unit_in_source=THOUSANDS becomes 354800.
    Non-currency fields (CUSTOMER_COUNT) go through this too since
    unit_in_source is ONE for them and the multiplier is a no-op; rounding to
    the nearest whole number is correct either way (see Part A item 3 - every
    stored value is a full-unit integer, never a fractional euro/count)."""
    return round(item.value * UNIT_SCALE_MULTIPLIER[item.unit_in_source])
