from weasyprint import HTML

from app.services.extraction.pdf_parser import parse_pdf


def _make_pdf_bytes(pages_html: list[str]) -> bytes:
    # WeasyPrint (already a dependency for board-report PDF export) renders real,
    # parseable PDFs from HTML - far more representative of pypdf's actual input
    # than a hand-crafted byte string, and needs no extra test dependency.
    page_breaks = '<div style="page-break-after: always;"></div>'.join(
        f"<p>{html}</p>" for html in pages_html
    )
    return HTML(string=page_breaks).write_pdf()


def test_parse_pdf_extracts_text_per_page_1_indexed():
    content = _make_pdf_bytes(["Revenue was 836,991 EUR", "Gross margin improved"])

    pages = parse_pdf(content)

    assert [p.page_number for p in pages] == [1, 2]
    assert "836,991" in pages[0].text
    assert "Gross margin" in pages[1].text


def test_parse_pdf_skips_blank_pages():
    # A page with only whitespace/no extractable text is dropped rather than
    # kept as an empty PageText - downstream (extract_financial_data) has no
    # use for pages with nothing to extract, and empty pages would just pad
    # the LLM prompt for no benefit.
    content = _make_pdf_bytes(["Real content here", "&nbsp;"])

    pages = parse_pdf(content)

    assert len(pages) == 1
    assert pages[0].page_number == 1
    assert "Real content" in pages[0].text
