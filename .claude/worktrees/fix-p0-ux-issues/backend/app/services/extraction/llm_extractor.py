from datetime import date

import anthropic
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.extraction.pdf_parser import PageText
from app.services.extraction.taxonomy import TAXONOMY


class ExtractedLineItem(BaseModel):
    taxonomy_code: str
    value: float
    currency: str
    period_start: date
    period_end: date
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
- For each extracted field, include a verbatim excerpt (at most ~200 characters) quoted directly from \
the document text that supports the value, and the page number it came from.
- confidence is a number between 0 and 1 reflecting how directly the document text supports the value \
(1.0 for an explicit, unambiguous figure; lower for a value that required interpretation).
- period_start/period_end describe the reporting period the value applies to (e.g. a fiscal year or \
half-year), as ISO dates.
- currency is the 3-letter ISO currency code the value is denominated in.
- CUSTOMER_COUNT has no currency; still populate the currency field with the company's reporting \
currency for consistency.
"""


def _render_document_text(pages: list[PageText]) -> str:
    return "\n\n".join(f"[Page {p.page_number}]\n{p.text}" for p in pages)


async def extract_financial_data(pages: list[PageText]) -> list[ExtractedLineItem]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    document_text = _render_document_text(pages)
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
