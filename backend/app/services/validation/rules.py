from collections.abc import Callable
from dataclasses import dataclass

# Rounding tolerance for a rule to still count as passing - real filings round
# each line to the nearest whole currency unit independently, so a sum of
# several rounded figures can be off by 1 from another independently-rounded
# figure without either being wrong (confirmed against Senus PLC's actual
# HY2026 cash flow statement: 140,135 - 410,291 - 8,500 + 1,013,846 = 735,190,
# one off from the filing's own stated closing cash of 735,189).
TOLERANCE = 1.0


@dataclass(frozen=True)
class RuleCheck:
    expected: float
    actual: float


@dataclass(frozen=True, kw_only=True)
class ValidationRule:
    name: str
    # The taxonomy code whose statement this rule's ValidationResult row is
    # anchored to (see ValidationResult.statement_id) - the figure the rule is
    # most directly "about", even though the check reads several codes.
    primary_code: str
    # Every taxonomy code the rule reads - used to build the values dict this
    # rule needs and to track which statements were "checked" at all (see
    # service.py), regardless of whether the check passed.
    involved_codes: tuple[str, ...]
    # Which of involved_codes become NEEDS_REVIEW when this rule fails.
    # Defaults to involved_codes (mark everything - the check alone can't say
    # which side is wrong) via __post_init__ below, but a rule checking a
    # SUBTOTAL against a formula of more granular base figures (e.g. Gross
    # Profit vs Revenue-COGS, or a cash bridge's closing balance vs the sum of
    # its components) should override this to just the subtotal: in a real
    # filing the granular base figures are typically raw ledger entries used
    # consistently elsewhere, while the subtotal is a separately-typed/rounded
    # figure more prone to a standalone error - see the real Senus HY2025
    # case this fixes, where a €1,000 typo in the filing's own stated Gross
    # Profit was incorrectly hiding an otherwise-correct Revenue figure from
    # the Revenue Trend chart.
    mark_on_failure: tuple[str, ...] = ()
    # Returns None when the codes this rule needs aren't all present for the
    # period being checked - a rule that can't run isn't a failure, it's
    # inapplicable (e.g. a company that's never reported NET_ASSETS).
    check: Callable[[dict[str, float]], RuleCheck | None]

    def __post_init__(self) -> None:
        if not self.mark_on_failure:
            object.__setattr__(self, "mark_on_failure", self.involved_codes)


def _get_all(values: dict[str, float], *codes: str) -> list[float] | None:
    result = []
    for code in codes:
        v = values.get(code)
        if v is None:
            return None
        result.append(v)
    return result


def _gross_profit_check(values: dict[str, float]) -> RuleCheck | None:
    got = _get_all(values, "GROSS_PROFIT", "REVENUE", "COST_OF_GOODS_SOLD")
    if got is None:
        return None
    gross_profit, revenue, cost_of_sales = got
    return RuleCheck(expected=gross_profit, actual=revenue - cost_of_sales)


def _net_assets_check(values: dict[str, float]) -> RuleCheck | None:
    got = _get_all(values, "NET_ASSETS", "TOTAL_EQUITY")
    if got is None:
        return None
    net_assets, total_equity = got
    return RuleCheck(expected=net_assets, actual=total_equity)


def _cash_bridge_check(values: dict[str, float]) -> RuleCheck | None:
    got = _get_all(
        values, "CASH_CLOSING", "CASH_OPENING", "NET_OPERATING_CASH_FLOW",
        "NET_INVESTING_CASH_FLOW", "NET_FINANCING_CASH_FLOW",
    )
    if got is None:
        return None
    cash_closing, opening, operating, investing, financing = got
    return RuleCheck(expected=cash_closing, actual=opening + operating + investing + financing)


def _cash_flow_matches_balance_sheet_check(values: dict[str, float]) -> RuleCheck | None:
    got = _get_all(values, "CASH_CLOSING", "CASH_AND_EQUIVALENTS")
    if got is None:
        return None
    cash_flow_closing_cash, balance_sheet_cash = got
    return RuleCheck(expected=cash_flow_closing_cash, actual=balance_sheet_cash)


VALIDATION_RULES: list[ValidationRule] = [
    ValidationRule(
        name="gross_profit_equals_revenue_minus_cost_of_sales",
        primary_code="GROSS_PROFIT",
        involved_codes=("GROSS_PROFIT", "REVENUE", "COST_OF_GOODS_SOLD"),
        # Only GROSS_PROFIT itself is flagged on failure - REVENUE and
        # COST_OF_GOODS_SOLD are base ledger figures used across many other
        # metrics/charts and are far more likely correct than a standalone
        # subtotal typo (see ValidationRule.mark_on_failure's docstring).
        mark_on_failure=("GROSS_PROFIT",),
        check=_gross_profit_check,
    ),
    ValidationRule(
        name="net_assets_equals_total_equity",
        primary_code="NET_ASSETS",
        involved_codes=("NET_ASSETS", "TOTAL_EQUITY"),
        # Two independently-stated totals with no clear "more trustworthy"
        # side - both flagged (the default).
        check=_net_assets_check,
    ),
    ValidationRule(
        name="cash_bridge_sums_to_closing_cash",
        primary_code="CASH_CLOSING",
        involved_codes=(
            "CASH_CLOSING", "CASH_OPENING", "NET_OPERATING_CASH_FLOW",
            "NET_INVESTING_CASH_FLOW", "NET_FINANCING_CASH_FLOW",
        ),
        # Only the closing-balance subtotal is flagged - the four component
        # cash flows are what the waterfall chart displays individually and
        # are more likely each correct on their own than the summary closing
        # figure is (same reasoning as the gross-profit rule above).
        mark_on_failure=("CASH_CLOSING",),
        check=_cash_bridge_check,
    ),
    ValidationRule(
        name="cash_flow_closing_cash_matches_balance_sheet_cash",
        primary_code="CASH_CLOSING",
        involved_codes=("CASH_CLOSING", "CASH_AND_EQUIVALENTS"),
        # Two independently-stated figures for the same concept - both
        # flagged (the default).
        check=_cash_flow_matches_balance_sheet_check,
    ),
]
