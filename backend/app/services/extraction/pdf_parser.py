from dataclasses import dataclass
from io import BytesIO

from pypdf import PdfReader


@dataclass(frozen=True)
class PageText:
    page_number: int
    text: str


def parse_pdf(content: bytes) -> list[PageText]:
    """Extract raw text per page, 1-indexed, so extracted values can cite a page number.

    Takes raw bytes rather than a filesystem path so it works the same way
    regardless of which StorageService backend the content came from (a local
    path isn't openable when storage_path is a remote Supabase URL) - callers
    read the file via StorageService.get() first, see
    app.services.extraction.pipeline.run_extraction.
    """
    reader = PdfReader(BytesIO(content))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(PageText(page_number=index, text=text))
    return pages
