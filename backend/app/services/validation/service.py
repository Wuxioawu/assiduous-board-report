import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StatementStatus
from app.models.financial_statement import FinancialStatement
from app.models.validation_result import ValidationResult
from app.services.extraction.taxonomy import TAXONOMY
from app.services.validation.rules import TOLERANCE, VALIDATION_RULES

REVENUE_SCALE_MIN = 10_000.0
REVENUE_SCALE_MAX = 100_000_000.0


async def run_validation(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    organization_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> list[ValidationResult]:
    """Runs every applicable accounting-identity + revenue-scale sanity check
    (see rules.py) for one statement-set - every FinancialStatement row
    sharing this exact company + period - storing a ValidationResult per
    check and setting each involved statement's status to NEEDS_REVIEW
    (failed) or CONFIRMED (passed) accordingly. A statement not covered by any
    applicable rule keeps its existing status untouched, since there's
    nothing to have validated it either way.

    Called synchronously right after extraction (see
    services/extraction/pipeline.py) and after a manual entry
    (api/v1/routes/financial_statements.py) - a chart must never be able to
    display a value that hasn't been through this at least once.
    """
    result = await db.execute(
        select(FinancialStatement).where(
            FinancialStatement.company_id == company_id,
            FinancialStatement.organization_id == organization_id,
            FinancialStatement.period_start == period_start,
            FinancialStatement.period_end == period_end,
        )
    )
    statements = list(result.scalars().all())
    if not statements:
        return []

    # Most-recently-updated row wins per taxonomy_code, in case duplicate
    # extractions left more than one row for the same code+period - matches
    # "the current value" semantics used everywhere else a statement is read.
    statement_by_code: dict[str, FinancialStatement] = {}
    for s in sorted(statements, key=lambda s: s.updated_at):
        statement_by_code[s.taxonomy_code] = s

    values = {code: float(s.value) for code, s in statement_by_code.items()}

    created: list[ValidationResult] = []
    checked_codes: set[str] = set()
    needs_review_codes: set[str] = set()

    def _record(
        *,
        rule_name: str,
        primary_code: str,
        expected: float,
        actual: float,
        involved: tuple[str, ...],
        mark_on_failure: tuple[str, ...],
    ) -> None:
        delta = actual - expected
        passed = abs(delta) <= TOLERANCE
        created.append(
            ValidationResult(
                organization_id=organization_id,
                statement_id=statement_by_code[primary_code].id,
                rule_name=rule_name,
                passed=passed,
                expected_value=expected,
                actual_value=actual,
                delta=delta,
            )
        )
        checked_codes.update(code for code in involved if code in statement_by_code)
        if not passed:
            needs_review_codes.update(code for code in mark_on_failure if code in statement_by_code)

    for rule in VALIDATION_RULES:
        outcome = rule.check(values)
        if outcome is None:
            continue
        _record(
            rule_name=rule.name,
            primary_code=rule.primary_code,
            expected=outcome.expected,
            actual=outcome.actual,
            involved=rule.involved_codes,
            mark_on_failure=rule.mark_on_failure,
        )

    for code, entry in TAXONOMY.items():
        if not entry.revenue_scale_check or code not in statement_by_code:
            continue
        value = values[code]
        if value < REVENUE_SCALE_MIN:
            bound = REVENUE_SCALE_MIN
        elif value > REVENUE_SCALE_MAX:
            bound = REVENUE_SCALE_MAX
        else:
            bound = value
        _record(
            rule_name="revenue_scale_sanity_check",
            primary_code=code,
            expected=bound,
            actual=value,
            involved=(code,),
            mark_on_failure=(code,),
        )

    for code in checked_codes:
        statement_by_code[code].status = (
            StatementStatus.NEEDS_REVIEW if code in needs_review_codes else StatementStatus.CONFIRMED
        )

    db.add_all(created)
    await db.flush()
    return created
