from datetime import date
from unittest.mock import AsyncMock, MagicMock

from app.db.session import AsyncSessionLocal
from app.models.enums import Audience, InsightSeverity, UserRole
from app.models.financial_statement import FinancialStatement
from app.models.metric import Metric
from app.repositories.company import CompanyRepository
from app.services.insight import generator
from app.services.insight.generator import GeneratedInsight, InsightSection, KeyStat, _format_metrics
from tests.conftest import create_org_with_user


def _metric(**overrides) -> Metric:
    defaults = dict(
        metric_key="revenue",
        metric_label="Revenue",
        value=836_991.0,
        unit="currency",
        period_start=date(2024, 7, 1),
        period_end=date(2025, 6, 30),
    )
    defaults.update(overrides)
    return Metric(**defaults)


class TestFormatMetrics:
    def test_groups_metrics_by_category_and_formats_lines(self):
        metrics = [
            _metric(metric_key="revenue", metric_label="Revenue", value=836_991.0),
            _metric(metric_key="dscr", metric_label="DSCR", value=1.4, unit="ratio"),
        ]

        formatted = _format_metrics(metrics)

        assert "[growth]" in formatted
        assert "[solvency]" in formatted
        assert "Revenue (revenue): 836991.00 currency" in formatted
        assert "DSCR (dscr): 1.40 ratio" in formatted

    def test_metrics_with_no_value_are_omitted(self):
        metrics = [_metric(value=None, reason="Missing REVENUE for prior period")]

        assert _format_metrics(metrics) == ""

    def test_unknown_metric_key_falls_back_to_other_category(self):
        metrics = [_metric(metric_key="not-in-registry", metric_label="Mystery", value=1.0)]

        assert "[other]" in _format_metrics(metrics)


def _generated_insight(**overrides) -> GeneratedInsight:
    defaults = dict(
        headline="Revenue grew steadily this period.",
        sections=[
            InsightSection(
                label="Revenue & Margins",
                summary="Revenue is up.",
                key_stats=[KeyStat(label="Revenue", value="€837.0K", trend="up")],
                detail="Driven by new customer accounts.",
            )
        ],
        watch_items=["Customer concentration risk"],
        severity=InsightSeverity.INFO,
    )
    defaults.update(overrides)
    return GeneratedInsight(**defaults)


def _mock_anthropic_client(monkeypatch, generated: GeneratedInsight) -> MagicMock:
    fake_client = MagicMock()
    fake_client.messages.parse = AsyncMock(return_value=MagicMock(parsed_output=generated))
    monkeypatch.setattr(generator.anthropic, "AsyncAnthropic", lambda **kwargs: fake_client)
    return fake_client


async def _seed_company_with_revenue(db, *, currency: str = "EUR"):
    org, user = await create_org_with_user(db, role=UserRole.OWNER)
    company = await CompanyRepository(db).create(
        organization_id=org.id, name="Senus", industry="Software", fiscal_year_end="06-30", currency=currency
    )
    db.add(
        FinancialStatement(
            organization_id=org.id,
            company_id=company.id,
            taxonomy_code="REVENUE",
            value=836_991.0,
            currency=currency,
            period_start=date(2024, 7, 1),
            period_end=date(2025, 6, 30),
            extracted_by="ai",
        )
    )
    await db.flush()
    await db.commit()
    return org, company


class TestGenerateNarrativeInsight:
    async def test_returns_none_when_company_has_no_financial_data(self, monkeypatch):
        _mock_anthropic_client(monkeypatch, _generated_insight())
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER)
            company = await CompanyRepository(db).create(
                organization_id=org.id, name="Empty Co", industry=None, fiscal_year_end=None, currency="USD"
            )
            await db.commit()

            insight = await generator.generate_narrative_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.BOARD
            )

        assert insight is None

    async def test_creates_and_persists_insight_from_llm_output(self, monkeypatch):
        generated = _generated_insight(headline="Strong growth, watch cash runway.")
        _mock_anthropic_client(monkeypatch, generated)

        async with AsyncSessionLocal() as db:
            org, company = await _seed_company_with_revenue(db)

            insight = await generator.generate_narrative_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.BOARD
            )

        assert insight is not None
        assert insight.title == "Strong growth, watch cash runway."
        assert insight.audience == Audience.BOARD.value
        assert insight.severity == InsightSeverity.INFO
        assert insight.structured_content["headline"] == "Strong growth, watch cash runway."
        assert "severity" not in insight.structured_content
        assert insight.period_end == date(2025, 6, 30)
        assert insight.is_edited is False

    async def test_regenerating_replaces_the_previous_insight_for_same_period_audience(self, monkeypatch):
        async with AsyncSessionLocal() as db:
            org, company = await _seed_company_with_revenue(db)

        _mock_anthropic_client(monkeypatch, _generated_insight(headline="First draft"))
        async with AsyncSessionLocal() as db:
            first = await generator.generate_narrative_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.BOARD
            )

        _mock_anthropic_client(monkeypatch, _generated_insight(headline="Revised draft"))
        async with AsyncSessionLocal() as db:
            second = await generator.generate_narrative_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.BOARD
            )

        assert first.id != second.id
        assert second.title == "Revised draft"

        async with AsyncSessionLocal() as db:
            from app.repositories.insight import InsightRepository

            cached = await InsightRepository(db).get_for_period_audience(
                company_id=company.id, organization_id=org.id, period_end=date(2025, 6, 30), audience="board"
            )
            assert cached.title == "Revised draft"


class TestGetOrGenerateInsight:
    async def test_generates_on_first_call_and_reuses_cache_on_second(self, monkeypatch):
        fake_client = _mock_anthropic_client(monkeypatch, _generated_insight())

        async with AsyncSessionLocal() as db:
            org, company = await _seed_company_with_revenue(db)

            first = await generator.get_or_generate_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.CREDIT
            )
            second = await generator.get_or_generate_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.CREDIT
            )

        assert first.id == second.id
        # The LLM must only be called once - the second call should be served
        # entirely from the cached Insight row.
        fake_client.messages.parse.assert_awaited_once()

    async def test_returns_none_when_no_financial_data_at_all(self, monkeypatch):
        _mock_anthropic_client(monkeypatch, _generated_insight())
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER)
            company = await CompanyRepository(db).create(
                organization_id=org.id, name="Empty Co", industry=None, fiscal_year_end=None, currency="USD"
            )
            await db.commit()

            insight = await generator.get_or_generate_insight(
                db, organization_id=org.id, company_id=company.id, audience=Audience.EQUITY
            )

        assert insight is None
