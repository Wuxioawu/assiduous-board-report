"""Runs the real extraction pipeline (real Anthropic API call) against the
actual Senus PLC HY2026 filing and asserts field-level equality against
ground truth read directly from the document by hand (see
tests/fixtures/senus_hy2026_ground_truth.json) - the point is to catch a
prompt/schema change that silently regresses extraction accuracy, which a
fully-mocked test (see test_extraction_pipeline.py) can never do since it
never actually exercises the LLM.

Skipped by default (see pyproject.toml's `regression` marker) - slow, costs
real API spend, and non-deterministic by nature (an LLM call) in a way the
rest of this suite deliberately isn't. Run explicitly with:
    pytest -m regression tests/test_extraction_regression.py
"""

import json
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.services.extraction.llm_extractor import extract_financial_data, normalize_to_full_units
from app.services.extraction.pdf_parser import parse_pdf
from app.services.metrics.fiscal_periods import classify_period_type

FIXTURES_DIR = Path(__file__).parent / "fixtures"
PDF_PATH = FIXTURES_DIR / "senus_hy2026.pdf"
GROUND_TRUTH_PATH = FIXTURES_DIR / "senus_hy2026_ground_truth.json"

# A line item is allowed to be off by this many full currency units before
# it counts as a regression - matches ValidationService's own rounding
# tolerance (see services/validation/rules.TOLERANCE), since the ground
# truth itself is subject to the same filing-level rounding.
TOLERANCE = 1.0


def _load_ground_truth() -> dict:
    return json.loads(GROUND_TRUTH_PATH.read_text())


@pytest.mark.regression
@pytest.mark.skipif(not get_settings().anthropic_api_key, reason="ANTHROPIC_API_KEY not configured")
async def test_extraction_matches_senus_hy2026_ground_truth():
    ground_truth = _load_ground_truth()
    pages = parse_pdf(PDF_PATH.read_bytes())
    line_items = await extract_financial_data(pages)

    # Index extracted items by (period_type, period_end, taxonomy_code) -
    # period_end alone can't disambiguate HY2026 from a same-period_end FY,
    # and this document only reports HY-type periods (HY2026 + HY2025
    # comparative), each with a distinct period_end.
    by_key = {}
    for item in line_items:
        by_key[(item.period_type.value, item.period_end.isoformat(), item.taxonomy_code)] = (
            normalize_to_full_units(item)
        )

    mismatches: list[str] = []
    missing: list[str] = []
    for period_label, period in ground_truth["periods"].items():
        period_type, period_end = period["period_type"], period["period_end"]
        for taxonomy_code, expected_value in period["line_items"].items():
            key = (period_type, period_end, taxonomy_code)
            if key not in by_key:
                missing.append(f"{period_label}.{taxonomy_code} (expected {expected_value}) - not extracted at all")
                continue
            actual_value = by_key[key]
            if abs(actual_value - expected_value) > TOLERANCE:
                mismatches.append(
                    f"{period_label}.{taxonomy_code}: expected {expected_value}, got {actual_value} "
                    f"(delta {actual_value - expected_value})"
                )

    failures = missing + mismatches
    assert not failures, "Extraction regressed vs ground truth:\n" + "\n".join(failures)

    # Sanity check on period_type itself, independent of the value match
    # above - a document this consistently HY-shaped should never be
    # classified as FY/Q by either the LLM or the date-span fallback.
    for item in line_items:
        assert item.period_type.value == classify_period_type(item.period_start, item.period_end).value
