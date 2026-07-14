from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import get_settings
from app.models.enums import PeriodType
from app.services.extraction import llm_extractor
from app.services.extraction.llm_extractor import (
    ExtractedLineItem,
    ExtractionResult,
    UnitScale,
    extract_financial_data,
)
from app.services.extraction.pdf_parser import PageText


def _mock_anthropic_client(monkeypatch, parsed_output: ExtractionResult) -> MagicMock:
    fake_client = MagicMock()
    fake_client.messages.parse = AsyncMock(return_value=MagicMock(parsed_output=parsed_output))
    # extract_financial_data instantiates its own client internally
    # (anthropic.AsyncAnthropic(...)) rather than accepting one as a
    # dependency, so the constructor itself has to be patched.
    monkeypatch.setattr(llm_extractor.anthropic, "AsyncAnthropic", lambda **kwargs: fake_client)
    return fake_client


def _line_item(**overrides) -> ExtractedLineItem:
    defaults = dict(
        taxonomy_code="REVENUE",
        value=836991.0,
        unit_in_source=UnitScale.ONE,
        currency="EUR",
        period_start=date(2024, 7, 1),
        period_end=date(2025, 6, 30),
        period_type=PeriodType.FY,
        confidence=0.95,
        source_excerpt="Revenue was EUR 836,991 for the period.",
        source_page=3,
    )
    defaults.update(overrides)
    return ExtractedLineItem(**defaults)


async def test_returns_parsed_line_items_unchanged(monkeypatch):
    item = _line_item()
    fake_client = _mock_anthropic_client(monkeypatch, ExtractionResult(line_items=[item]))

    result = await extract_financial_data([PageText(page_number=1, text="Revenue was EUR 836,991")])

    assert result == [item]
    fake_client.messages.parse.assert_awaited_once()


async def test_truncates_source_excerpt_to_200_chars(monkeypatch):
    item = _line_item(source_excerpt="x" * 500)
    _mock_anthropic_client(monkeypatch, ExtractionResult(line_items=[item]))

    result = await extract_financial_data([PageText(page_number=1, text="text")])

    assert len(result[0].source_excerpt) == 200


async def test_leaves_short_source_excerpt_untouched(monkeypatch):
    item = _line_item(source_excerpt="short excerpt")
    _mock_anthropic_client(monkeypatch, ExtractionResult(line_items=[item]))

    result = await extract_financial_data([PageText(page_number=1, text="text")])

    assert result[0].source_excerpt == "short excerpt"


async def test_returns_empty_list_when_nothing_extracted(monkeypatch):
    _mock_anthropic_client(monkeypatch, ExtractionResult(line_items=[]))

    result = await extract_financial_data([PageText(page_number=1, text="no financial data here")])

    assert result == []


async def test_calls_api_with_expected_model_and_document_text(monkeypatch):
    fake_client = _mock_anthropic_client(monkeypatch, ExtractionResult(line_items=[]))

    await extract_financial_data(
        [PageText(page_number=1, text="Revenue EUR 100"), PageText(page_number=2, text="Costs EUR 40")]
    )

    call_kwargs = fake_client.messages.parse.await_args.kwargs
    assert call_kwargs["model"] == get_settings().extraction_model
    assert call_kwargs["output_format"] is ExtractionResult
    document_text = call_kwargs["messages"][0]["content"]
    assert "[Page 1]" in document_text and "Revenue EUR 100" in document_text
    assert "[Page 2]" in document_text and "Costs EUR 40" in document_text
    # The taxonomy listing (used to constrain what the model may extract)
    # must actually be present in the system prompt sent to the API.
    assert "REVENUE" in call_kwargs["system"]


@pytest.mark.parametrize("bad_confidence", [-0.1, 1.1])
def test_extracted_line_item_rejects_out_of_range_confidence(bad_confidence):
    with pytest.raises(ValueError):
        _line_item(confidence=bad_confidence)


@pytest.mark.parametrize(
    ("value", "unit_in_source", "expected"),
    [
        (354813.0, UnitScale.ONE, 354813),
        (354.8, UnitScale.THOUSANDS, 354800),
        (0.3548, UnitScale.MILLIONS, 354800),
        (138.0, UnitScale.ONE, 138),  # CUSTOMER_COUNT-shaped: no currency, ONE is a no-op
    ],
)
def test_normalize_to_full_units(value, unit_in_source, expected):
    from app.services.extraction.llm_extractor import normalize_to_full_units

    item = _line_item(value=value, unit_in_source=unit_in_source)
    assert normalize_to_full_units(item) == expected
