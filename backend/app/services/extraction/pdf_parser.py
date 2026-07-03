from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


@dataclass(frozen=True)
class PageText:
    page_number: int
    text: str


def parse_pdf(path: str | Path) -> list[PageText]:
    """Extract raw text per page, 1-indexed, so extracted values can cite a page number."""
    reader = PdfReader(str(path))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(PageText(page_number=index, text=text))
    return pages
