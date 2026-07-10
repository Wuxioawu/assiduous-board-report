from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.db.session import AsyncSessionLocal
from app.models.enums import Audience, UserRole
from app.models.financial_statement import FinancialStatement
from app.repositories.company import CompanyRepository
from app.services.export import pdf
from app.services.metrics.registry import METRIC_REGISTRY
from tests.conftest import create_org_with_user


class TestFormatMetricValue:
    def test_currency_under_a_thousand(self):
        assert pdf.format_metric_value(842.5, "currency", "EUR") == "€842.5"

    def test_currency_thousands_suffix(self):
        assert pdf.format_metric_value(836_991, "currency", "EUR") == "€837.0K"

    def test_currency_millions_suffix(self):
        assert pdf.format_metric_value(4_200_000, "currency", "USD") == "$4.2M"

    def test_currency_billions_suffix(self):
        assert pdf.format_metric_value(1_500_000_000, "currency", "GBP") == "£1.5B"

    def test_currency_negative_value_keeps_sign_before_symbol(self):
        assert pdf.format_metric_value(-2_000_000, "currency", "USD") == "-$2.0M"

    def test_currency_falls_back_to_iso_code_for_unknown_currency(self):
        assert pdf.format_metric_value(500, "currency", "JPY") == "JPY 500.0"

    def test_percentage(self):
        assert pdf.format_metric_value(81.66, "percentage", "USD") == "81.7%"

    def test_ratio(self):
        assert pdf.format_metric_value(1.42, "ratio", "USD") == "1.4x"

    def test_months_under_cap(self):
        assert pdf.format_metric_value(8.3, "months", "USD") == "8.3 mo"

    def test_months_over_120_is_capped_display(self):
        assert pdf.format_metric_value(999, "months", "USD") == "120+ mo"

    def test_unknown_unit_falls_back_to_plain_count(self):
        assert pdf.format_metric_value(138, "count", "USD") == "138"


class TestBuildReportFilename:
    def test_uses_period_start_and_end_year_month(self):
        name = pdf.build_report_filename("Senus", date(2024, 7, 1), date(2025, 6, 30))
        assert name == "Senus - Board Report - 2024-07 to 2025-06.pdf"

    def test_falls_back_to_period_end_when_no_period_start(self):
        name = pdf.build_report_filename("Senus", None, date(2025, 6, 30))
        assert name == "Senus - Board Report - 2025-06 to 2025-06.pdf"


class TestBuildVariance:
    def test_none_when_metric_has_no_budget_taxonomy_code(self):
        definition = SimpleNamespace(budget_taxonomy_code=None, higher_is_better=True)
        m = SimpleNamespace(value=100, unit="currency")

        assert pdf._build_variance(m, definition, "EUR", {}) is None

    def test_none_when_no_budget_set_for_this_period(self):
        definition = METRIC_REGISTRY["revenue"]
        m = SimpleNamespace(value=100, unit="currency")

        assert pdf._build_variance(m, definition, "EUR", {}) is None

    def test_favorable_variance_for_higher_is_better_metric_beating_budget(self):
        definition = METRIC_REGISTRY["revenue"]  # higher_is_better=True
        m = SimpleNamespace(value=120_000, unit="currency")
        budget = SimpleNamespace(value=100_000)

        variance = pdf._build_variance(m, definition, "EUR", {"REVENUE": budget})

        assert variance["color"] == pdf._FAVORABLE_COLOR
        assert "+20.0%" in variance["variance_text"]
        assert "▲" in variance["variance_text"]

    def test_unfavorable_variance_for_higher_is_better_metric_missing_budget(self):
        definition = METRIC_REGISTRY["revenue"]
        m = SimpleNamespace(value=80_000, unit="currency")
        budget = SimpleNamespace(value=100_000)

        variance = pdf._build_variance(m, definition, "EUR", {"REVENUE": budget})

        assert variance["color"] == pdf._UNFAVORABLE_COLOR
        assert "-20.0%" in variance["variance_text"]
        assert "▼" in variance["variance_text"]

    def test_zero_budget_reports_not_applicable_rather_than_dividing_by_zero(self):
        definition = METRIC_REGISTRY["revenue"]
        m = SimpleNamespace(value=100, unit="currency")
        budget = SimpleNamespace(value=0)

        variance = pdf._build_variance(m, definition, "EUR", {"REVENUE": budget})

        assert variance["variance_text"] == "n/a"


async def _seed_company_with_revenue(db, *, value: float = 836_991.0, currency: str = "EUR"):
    org, user = await create_org_with_user(db, role=UserRole.OWNER)
    company = await CompanyRepository(db).create(
        organization_id=org.id, name="Senus", industry="Software", fiscal_year_end="06-30", currency=currency
    )
    db.add(
        FinancialStatement(
            organization_id=org.id,
            company_id=company.id,
            taxonomy_code="REVENUE",
            value=value,
            currency=currency,
            period_start=date(2024, 7, 1),
            period_end=date(2025, 6, 30),
            extracted_by="ai",
        )
    )
    await db.flush()
    await db.commit()
    return org, company


class TestRenderReportPdf:
    async def test_returns_none_when_company_has_no_financial_data(self, monkeypatch):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER)
            company = await CompanyRepository(db).create(
                organization_id=org.id, name="Empty Co", industry=None, fiscal_year_end=None, currency="USD"
            )
            await db.commit()

            pdf_bytes, period_start, period_end = await pdf.render_report_pdf(
                db, organization_id=org.id, company=company, sections=[Audience.BOARD], period_end=None
            )

        assert pdf_bytes is None
        assert period_start is None
        assert period_end is None

    async def test_generates_pdf_bytes_for_company_with_data(self, monkeypatch):
        monkeypatch.setattr(pdf, "get_or_generate_insight", AsyncMock(return_value=None))

        async with AsyncSessionLocal() as db:
            org, company = await _seed_company_with_revenue(db)

            pdf_bytes, period_start, period_end = await pdf.render_report_pdf(
                db,
                organization_id=org.id,
                company=company,
                sections=[Audience.BOARD, Audience.CREDIT],
                period_end=None,
            )

        assert pdf_bytes is not None
        assert pdf_bytes[:5] == b"%PDF-"
        assert period_start == date(2024, 7, 1)
        assert period_end == date(2025, 6, 30)

    async def test_resolves_explicit_period_end(self, monkeypatch):
        monkeypatch.setattr(pdf, "get_or_generate_insight", AsyncMock(return_value=None))

        async with AsyncSessionLocal() as db:
            org, company = await _seed_company_with_revenue(db)

            pdf_bytes, period_start, period_end = await pdf.render_report_pdf(
                db,
                organization_id=org.id,
                company=company,
                sections=[Audience.MANAGEMENT],
                period_end=date(2025, 6, 30),
            )

        assert pdf_bytes is not None
        assert period_end == date(2025, 6, 30)
