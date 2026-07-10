import asyncio
import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Locator, Page, async_playwright
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.document import Document
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.services.extraction.pipeline import run_extraction
from app.services.storage import StorageService, get_storage_service

logger = logging.getLogger(__name__)

# Best-effort heuristic for a single, well-structured source (a company's own
# investor-relations page) - not a general-purpose filing scraper. See the
# scoping note in ARCHITECTURE.md/ROADMAP.md.
#
# Confirmed structure for the Senus PLC IR site (a JS-rendered Next.js SPA,
# investigated directly - see the two-level flow below):
#   Level 1: filings are listed across more than one section of the same
#     page - confirmed present in <section id="results"> (financial results
#     only) AND <section id="regulatory-news"> (a mixed feed of results,
#     AGM notices, and press releases). Each entry is a card with no
#     <a href> or data-id - the target result ID only exists in front-end
#     router state, so it can only be learned by actually clicking a card
#     and reading the URL it navigates to, not by parsing hrefs up front.
#     Each card's filename is in an <h3>; its date+category label (e.g.
#     "Half Year Results", "AGM", "Result" - absent for some entries) is in
#     the previous sibling element, read without navigating so non-financial
#     entries (see _is_financial_filing) can be skipped before spending a
#     click + page load on them.
#   Level 2: clicking a card navigates to a detail URL (confirmed under both
#     .../results/{uuid} and .../regulatory-news/{uuid} - the same filing
#     cross-listed in both sections gets a DIFFERENT id per section, which
#     is why cross-section duplicates are deduped by title before ever
#     clicking in, not by id) that renders the filing directly in an
#     embedded PDF viewer. There's no static PDF link either - the only way
#     to get the file is to click the toolbar button labeled "Download
#     document" and capture Playwright's `download` event.
# All of this is DOM/behavior fact about the real site, not assumption - if
# the site's markup changes, the selectors below (scoped narrowly, with a
# heading-tag fallback) are the first thing to re-verify by hand.

_LIST_SECTION_IDS = ("results", "regulatory-news")
_FALLBACK_SECTION_ID = "__fallback__"

_RESULT_ID_PATTERN = re.compile(r"/(?:results|regulatory-news)/([0-9a-fA-F-]{8,})")
_PDF_LABEL_PATTERN = re.compile(r"\.pdf\s*$", re.IGNORECASE)
_DOWNLOAD_NAME_PATTERN = re.compile("download", re.IGNORECASE)
_CLOSE_NAME_PATTERN = re.compile("close", re.IGNORECASE)

# Keyword heuristic for issue 2 (see ROADMAP.md): the site mixes financial
# results in with AGM notices and press releases under the same "Regulatory
# News" feed, distinguished only by a short category label plus the
# filename. A label can say "Results" on an entry that's actually a press
# release (confirmed: "Senus PLC Direct Listing Launch Press Release" is
# labeled "Results") - so the exclude list is checked first, against label
# + title combined, and wins over a matching include keyword.
_FINANCIAL_KEYWORDS = ("result", "half year", "half-year", "annual report", "financial statement")
_NON_FINANCIAL_KEYWORDS = ("press release", "leadership", "personnel", "agm", "proxy", "circular")

_CARD_LABEL_JS = """e => {
    const title = e.innerText.trim();
    const infoContainer = e.previousElementSibling;
    if (!infoContainer) return { title, label: '', dateText: '' };
    const parts = Array.from(infoContainer.children).map(c => c.innerText.trim()).filter(Boolean);
    return { title, label: parts.slice(1).join(' ').trim(), dateText: parts[0] || '' };
}"""

# Matches the site's "19 Mar 2026" date format on each card. Deliberately not
# using strptime's locale-sensitive %b - the site's month abbreviations are
# fixed English text regardless of server locale, so a fixed lookup avoids a
# deployment-locale surprise silently breaking the recency sort (see
# _parse_card_date and issue 1's "most recent N" requirement).
_CARD_DATE_PATTERN = re.compile(r"(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})")
_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _parse_card_date(text: str) -> date | None:
    match = _CARD_DATE_PATTERN.match(text.strip())
    if not match:
        return None
    day, month_abbr, year = match.groups()
    month = _MONTH_ABBR.get(month_abbr.lower())
    if month is None:
        return None
    try:
        return date(int(year), month, int(day))
    except ValueError:
        return None


def _is_financial_filing(*, label: str, title: str) -> bool:
    combined = f"{label} {title}".lower()
    if any(keyword in combined for keyword in _NON_FINANCIAL_KEYWORDS):
        return False
    if any(keyword in combined for keyword in _FINANCIAL_KEYWORDS):
        return True
    # No clear signal either way - err toward fetching rather than risk
    # silently missing a legitimate filing over an overly strict filter.
    return True


@dataclass
class _CardInfo:
    section_id: str
    index: int
    title: str
    label: str
    sort_date: date | None


# Signature that schedules extraction for a newly-ingested document, so this
# module doesn't need to know whether the caller is an HTTP request (which
# defers via FastAPI BackgroundTasks) or the periodic scheduler (which just
# fires an asyncio task directly).
ScheduleExtraction = Callable[[uuid.UUID, uuid.UUID, uuid.UUID, str], None]


@dataclass
class FetchOutcome:
    message: str
    error: bool = False
    documents: list[Document] = field(default_factory=list)


def _slug_filename(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9-_]+", "-", text).strip("-") or "document"
    return f"{slug[:100]}.pdf"


def _cards_locator_for(page: Page, section_id: str) -> Locator:
    if section_id == _FALLBACK_SECTION_ID:
        return page.locator("h1, h2, h3, h4").filter(has_text=_PDF_LABEL_PATTERN)
    return page.locator(f"#{section_id} h3")


async def _discover_cards(page: Page, *, timeout_ms: float) -> list[_CardInfo]:
    """Gathers every result card's title + category label across all of the
    site's known list sections (#results, #regulatory-news), without
    navigating into any of them - so financial-relevance filtering (see
    _is_financial_filing) can happen before spending a click + page load on
    a card that's going to be skipped anyway.

    Waiting has to happen per-section (not a synchronous .count() check) -
    a section can render before its data has hydrated, so a snapshot count
    taken too early reads as empty. Raises (propagates PlaywrightError) if
    NONE of the known sections, nor the page-wide fallback, ever render -
    the caller turns that into "no results found"."""
    present_section_ids = []
    for section_id in _LIST_SECTION_IDS:
        try:
            await _cards_locator_for(page, section_id).first.wait_for(timeout=timeout_ms)
            present_section_ids.append(section_id)
        except PlaywrightError:
            continue

    if not present_section_ids:
        # Neither known section rendered - a markup change, most likely.
        # Fall back to a page-wide scan (still filtered to filing-shaped
        # labels) so this degrades to "search more broadly" rather than
        # "find nothing"; raises onward if even that finds nothing.
        await _cards_locator_for(page, _FALLBACK_SECTION_ID).first.wait_for(timeout=timeout_ms)
        present_section_ids = [_FALLBACK_SECTION_ID]

    cards: list[_CardInfo] = []
    for section_id in present_section_ids:
        locator = _cards_locator_for(page, section_id)
        count = await locator.count()
        for index in range(count):
            if section_id == _FALLBACK_SECTION_ID:
                title = (await locator.nth(index).inner_text()).strip()
                label = ""
                sort_date = None
            else:
                info = await locator.nth(index).evaluate(_CARD_LABEL_JS)
                title, label = info["title"], info["label"]
                sort_date = _parse_card_date(info["dateText"])
            cards.append(
                _CardInfo(section_id=section_id, index=index, title=title, label=label, sort_date=sort_date)
            )
    return cards


async def _find_download_trigger(page: Page) -> Locator | None:
    """Locates the control that triggers the actual file download on a
    result's detail page. Tries an accessible-name match first (works for
    the confirmed icon-only "Download document" button), then falls back to
    anything whose visible label looks like the filing's filename."""
    for role in ("button", "link"):
        candidate = page.get_by_role(role, name=_DOWNLOAD_NAME_PATTERN)
        if await candidate.count() > 0:
            return candidate.first
    candidate = page.locator("button, a").filter(has_text=_PDF_LABEL_PATTERN)
    if await candidate.count() > 0:
        return candidate.first
    return None


async def _download_current_result(page: Page, *, timeout_ms: float) -> bytes | None:
    """Given a page already on a result's detail view, finds and clicks its
    download trigger and returns the downloaded file's bytes, or None if no
    download trigger could be found."""
    trigger = await _find_download_trigger(page)
    if trigger is None:
        return None

    # The download button can render slightly before its handler/blob is
    # actually ready; clicking immediately on attach is flaky (confirmed by
    # hand), so give it a brief moment to settle first.
    await page.wait_for_timeout(1000)
    async with page.expect_download(timeout=timeout_ms) as download_info:
        await trigger.click()
    download = await download_info.value
    download_path = await download.path()
    if download_path is None:
        return None
    return Path(download_path).read_bytes()


async def _return_to_list(page: Page, *, section_id: str, timeout_ms: float) -> None:
    """Leaves a result's detail view and gets back to a state where the next
    card can be clicked. `page.go_back()` alone only changes the URL - the
    PDF viewer itself is an overlay that stays mounted on top of the list
    underneath (confirmed: after go_back with the viewer still open, list
    cards further down the page are computed as present but not properly
    clickable/scrollable-to, because the still-open viewer is in the way).
    So the viewer has to be explicitly closed first; closing it doesn't
    itself change the URL back, so go_back is still needed after."""
    close_button = page.get_by_role("button", name=_CLOSE_NAME_PATTERN)
    if await close_button.count() > 0:
        await close_button.first.click()
        await page.wait_for_timeout(300)
    await page.go_back(wait_until="load", timeout=timeout_ms)
    await _cards_locator_for(page, section_id).first.wait_for(timeout=timeout_ms)


def _start_of_today_utc() -> datetime:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def _check_company_for_new_documents(
    db: AsyncSession, *, organization_id: uuid.UUID, company: Company, storage: StorageService
) -> FetchOutcome:
    if not company.investor_relations_url:
        return FetchOutcome(message="No investor-relations URL configured", error=True)

    settings = get_settings()
    timeout_ms = settings.auto_fetch_http_timeout_seconds * 1000
    doc_repo = DocumentRepository(db)

    # Daily cost cap is checked first, before anything that costs money or
    # even opens a browser - if there's no budget left today, there's no
    # point crawling at all. Org-wide (not per-company): bounds total
    # exposure across every company the org has auto-fetch on for.
    already_today = await doc_repo.count_auto_fetched_since(
        organization_id=organization_id, since=_start_of_today_utc()
    )
    if already_today >= settings.auto_fetch_daily_extraction_limit:
        logger.warning(
            "Auto-fetch: org %s already used its daily extraction budget (%d/%d) - skipping company %s",
            organization_id, already_today, settings.auto_fetch_daily_extraction_limit, company.id,
        )
        return FetchOutcome(
            message="Daily auto-fetch limit reached, try again tomorrow or upload manually.", error=True
        )
    remaining_daily_budget = settings.auto_fetch_daily_extraction_limit - already_today

    existing_ids = await doc_repo.list_external_source_ids_for_company(
        company_id=company.id, organization_id=organization_id
    )
    # Cheap pre-click dedup: a card whose title exactly matches a filename
    # we've already ingested (any source) is filtered out before it's ever
    # clicked into - no page load, no download, no LLM cost - rather than
    # only being caught by the external_source_id check after navigating in.
    existing_filenames = await doc_repo.list_filenames_for_company(
        company_id=company.id, organization_id=organization_id
    )

    created_documents: list[Document] = []
    missing_download_titles: list[str] = []
    skipped_non_financial: list[str] = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            page = await (await browser.new_context(accept_downloads=True)).new_page()
            try:
                await page.goto(company.investor_relations_url, wait_until="load", timeout=timeout_ms)
            except PlaywrightError as exc:
                logger.warning("Auto-fetch: could not reach %s: %s", company.investor_relations_url, exc)
                return FetchOutcome(message=f"Could not reach investor-relations page: {exc}", error=True)

            try:
                plan = await _discover_cards(page, timeout_ms=timeout_ms)
            except PlaywrightError:
                return FetchOutcome(message="No results found on the investor-relations page.", error=True)
            if not plan:
                return FetchOutcome(message="No results found on the investor-relations page.", error=True)

            # Reduce the raw list page-wide to genuinely-new financial
            # candidates - all of this is title/label text already gathered
            # by _discover_cards, so none of it costs a click yet.
            new_candidates: list[_CardInfo] = []
            seen_titles: set[str] = set()
            for card in plan:
                # The same filing can be cross-listed across sections
                # (confirmed: the Half Year Results PDF appears in both
                # #results and #regulatory-news, under two DIFFERENT
                # detail-page ids) - dedup by title up front so it's
                # neither clicked into nor extracted twice in the same run.
                if card.title in seen_titles:
                    continue
                seen_titles.add(card.title)

                if not _is_financial_filing(label=card.label, title=card.title):
                    logger.info(
                        "Auto-fetch: skipped %r - not a financial filing (label=%r)", card.title, card.label
                    )
                    skipped_non_financial.append(card.title)
                    continue

                if card.title in existing_filenames:
                    logger.info("Auto-fetch: skipped %r - already ingested (matched by filename)", card.title)
                    continue

                new_candidates.append(card)

            # Circuit breaker: an unusually large number of "new" candidates
            # in one run is far more likely to be a crawl/dedup bug than a
            # real burst of filings (this is exactly the shape the earlier
            # cross-section duplicate-detection bug took) - halt and disable
            # rather than process any of them.
            if len(new_candidates) > settings.auto_fetch_circuit_breaker_threshold:
                company.auto_fetch_enabled = False
                logger.warning(
                    "Auto-fetch: circuit breaker tripped for company %s (%d new candidates, threshold %d) - "
                    "auto_fetch_enabled disabled",
                    company.id, len(new_candidates), settings.auto_fetch_circuit_breaker_threshold,
                )
                return FetchOutcome(
                    message=(
                        "Automatic fetching was paused because an unusual number of documents were "
                        "detected — please review manually."
                    ),
                    error=True,
                )

            # Most-recent-first, so the per-run cap (below) keeps the newest
            # filings rather than an arbitrary DOM-order subset. date.min is
            # smaller than any real date, so entries whose date couldn't be
            # parsed naturally sort after every dated entry (stable sort
            # keeps their original relative order among themselves) while
            # still being eligible if the cap allows.
            new_candidates.sort(key=lambda c: c.sort_date or date.min, reverse=True)

            effective_cap = min(settings.auto_fetch_max_documents_per_check, remaining_daily_budget)
            capped_by_daily_limit = remaining_daily_budget < settings.auto_fetch_max_documents_per_check
            to_process = new_candidates[:effective_cap]
            total_new_found = len(new_candidates)

            logger.info(
                "Auto-fetch: company %s - %d new candidate(s) found, processing %d (daily budget %d/%d used)",
                company.id, total_new_found, len(to_process), already_today, settings.auto_fetch_daily_extraction_limit,
            )

            for card in to_process:
                try:
                    await _cards_locator_for(page, card.section_id).nth(card.index).click()
                    await page.wait_for_url(_RESULT_ID_PATTERN, timeout=timeout_ms)
                except PlaywrightError:
                    logger.warning("Auto-fetch: clicking result card %r did not open a result page", card.title)
                    missing_download_titles.append(card.title)
                    continue

                try:
                    match = _RESULT_ID_PATTERN.search(page.url)
                    external_id = match.group(1) if match else None
                    if external_id is None or external_id in existing_ids:
                        await _return_to_list(page, section_id=card.section_id, timeout_ms=timeout_ms)
                        continue

                    try:
                        content = await _download_current_result(page, timeout_ms=timeout_ms)
                    except PlaywrightError:
                        content = None

                    if content is None:
                        logger.warning("Auto-fetch: could not locate a download action for result %r", card.title)
                        missing_download_titles.append(card.title)
                    else:
                        filename = _slug_filename(card.title) if not card.title.lower().endswith(".pdf") else card.title
                        storage_path = await storage.save_bytes(
                            organization_id=organization_id,
                            company_id=company.id,
                            filename=filename,
                            content=content,
                        )
                        document = await doc_repo.create(
                            organization_id=organization_id,
                            company_id=company.id,
                            uploaded_by_user_id=None,
                            filename=filename,
                            file_type="pdf",
                            storage_path=storage_path,
                            source_type="auto_fetched",
                            source_url=page.url,
                            external_source_id=external_id,
                        )
                        created_documents.append(document)
                        existing_ids.add(external_id)

                    await _return_to_list(page, section_id=card.section_id, timeout_ms=timeout_ms)
                except PlaywrightError as exc:
                    # Anything else browser-side (e.g. couldn't navigate back
                    # to the list) - stop processing further cards rather
                    # than crash the request; whatever was already ingested
                    # this run is kept and reported.
                    logger.warning("Auto-fetch: stopping after an unexpected browser error: %s", exc)
                    break
        except PlaywrightError as exc:
            logger.warning("Auto-fetch: browser automation failed for %s: %s", company.investor_relations_url, exc)
            if not created_documents:
                return FetchOutcome(message=f"Could not check investor-relations page: {exc}", error=True)
        finally:
            await browser.close()

    logger.info(
        "Auto-fetch: run complete for company %s - %d LLM extraction call(s) triggered, "
        "%d skipped non-financial, %d missing download",
        company.id, len(created_documents), len(skipped_non_financial), len(missing_download_titles),
    )

    message_parts: list[str] = []
    if created_documents and total_new_found > len(to_process):
        if capped_by_daily_limit:
            message_parts.append(
                f"Found {total_new_found} new documents, processed {len(created_documents)} "
                "(daily auto-fetch limit reached). Run Check Now again tomorrow or upload manually."
            )
        else:
            message_parts.append(
                f"Found {total_new_found} new documents, processed the {len(to_process)} most recent. "
                "Run Check Now again to process more."
            )
    elif created_documents:
        count = len(created_documents)
        message_parts.append(f"Found {count} new document{'s' if count != 1 else ''}")
    if skipped_non_financial:
        message_parts.append(
            f"Skipped {len(skipped_non_financial)} non-financial entr"
            f"{'y' if len(skipped_non_financial) == 1 else 'ies'}"
        )
    if missing_download_titles:
        joined = "; ".join(missing_download_titles[:5])
        count = len(missing_download_titles)
        message_parts.append(
            f"Could not locate a download action for {count} result{'s' if count != 1 else ''}: {joined}"
        )

    if not message_parts:
        return FetchOutcome(message="No new documents found")

    return FetchOutcome(
        message=" | ".join(message_parts),
        documents=created_documents,
        error=not created_documents and bool(missing_download_titles),
    )


async def run_fetch_check(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company: Company,
    storage: StorageService,
    schedule_extraction: ScheduleExtraction,
) -> FetchOutcome:
    """Checks a company's investor-relations URL for new filings, ingests any
    found (same Document + extraction pipeline as a manual upload), and
    records the outcome on the company + audit log. Never raises for
    unreachable pages or missing links - failures are reported in the
    returned message, not swallowed silently."""
    outcome = await _check_company_for_new_documents(
        db, organization_id=organization_id, company=company, storage=storage
    )

    audit_repo = AuditLogRepository(db)
    for document in outcome.documents:
        await audit_repo.create(
            organization_id=organization_id,
            user_id=None,
            action="document_auto_fetched",
            resource_type="document",
            resource_id=document.id,
            extra_data={
                "source_url": document.source_url,
                "filename": document.filename,
                "external_source_id": document.external_source_id,
            },
        )
        logger.info(
            "Auto-fetch: scheduling LLM extraction for document %s (%r) - company %s, org %s",
            document.id, document.filename, company.id, organization_id,
        )
        schedule_extraction(document.id, organization_id, company.id, document.storage_path)

    await CompanyRepository(db).update_fetch_status(
        company, checked_at=datetime.now(UTC), result=outcome.message
    )
    await db.commit()

    return outcome


def _schedule_extraction_as_task(
    document_id: uuid.UUID, organization_id: uuid.UUID, company_id: uuid.UUID, storage_path: str
) -> None:
    asyncio.create_task(
        run_extraction(
            document_id=document_id,
            organization_id=organization_id,
            company_id=company_id,
            storage_path=storage_path,
        )
    )


async def run_periodic_auto_fetch() -> None:
    """Background loop started at app startup (see main.py's lifespan): checks
    every auto_fetch_enabled company on a fixed interval. A full task
    scheduler (Celery Beat) is a Phase 2 upgrade - this simple asyncio loop is
    sufficient for the current single-process deployment."""
    settings = get_settings()
    interval_seconds = max(settings.auto_fetch_interval_hours, 1) * 3600
    try:
        # get_storage_service() can now raise (StorageSupabaseError) if
        # STORAGE_PROVIDER=supabase is misconfigured - this task is fire-and-forget
        # (asyncio.create_task in main.py's lifespan), so an uncaught exception here
        # would silently kill auto-fetch forever with nothing but an unretrieved-task
        # warning in the logs, rather than the clear message this gives instead.
        storage = get_storage_service()
    except Exception:  # noqa: BLE001 - see comment above; must not crash app startup either
        logger.exception("Auto-fetch scheduler failed to start: could not initialize storage service")
        return
    while True:
        try:
            await _check_all_enabled_companies(storage)
        except Exception:  # noqa: BLE001 - one bad iteration must not kill the loop
            logger.exception("Auto-fetch scheduler iteration failed")
        await asyncio.sleep(interval_seconds)


async def _check_all_enabled_companies(storage: StorageService) -> None:
    async with AsyncSessionLocal() as db:
        companies = await CompanyRepository(db).list_auto_fetch_enabled()
        for company in companies:
            try:
                await run_fetch_check(
                    db,
                    organization_id=company.organization_id,
                    company=company,
                    storage=storage,
                    schedule_extraction=_schedule_extraction_as_task,
                )
            except Exception:  # noqa: BLE001 - one company failing must not block the rest
                logger.exception("Auto-fetch failed for company %s", company.id)
