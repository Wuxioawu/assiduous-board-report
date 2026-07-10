from app.services.metrics.common import MetricResult, PeriodFinancials

EBITDA = "EBITDA"
TOTAL_DEBT = "TOTAL_DEBT"
DEBT_SERVICE = "DEBT_SERVICE"

# A single missing code is named by its exact taxonomy code (matches what's
# shown in the extracted-data table on the Documents page, so a user can go
# search for that exact string). Multiple missing codes read better in a
# friendlier form than "EBITDA and DEBT_SERVICE".
_DISPLAY_NAMES = {DEBT_SERVICE: "Debt Service", TOTAL_DEBT: "Total Debt"}


def _missing_reason(*, missing: list[str], zero: str | None = None) -> str | None:
    """Names exactly which taxonomy code(s) are absent, e.g. "TOTAL_DEBT not
    extracted for this period" - specific enough that a user knows exactly
    what to go add on the Documents page, rather than a vague "some data
    missing"."""
    if zero is not None:
        return zero
    if not missing:
        return None
    if len(missing) == 1:
        return f"{missing[0]} not extracted for this period"
    friendly = [_DISPLAY_NAMES.get(code, code) for code in missing]
    return f"{' and '.join(friendly)} data not available for this period"


def compute_solvency_metrics(current: PeriodFinancials) -> list[MetricResult]:
    v = current.values
    ebitda = v.get(EBITDA)
    debt_service = v.get(DEBT_SERVICE)
    total_debt = v.get(TOTAL_DEBT)

    missing_for_dscr = [name for name, value in (("EBITDA", ebitda), ("DEBT_SERVICE", debt_service)) if value is None]
    dscr = None
    dscr_reason = _missing_reason(missing=missing_for_dscr)
    if not missing_for_dscr:
        if debt_service == 0:
            dscr_reason = "Debt service is zero for this period"
        else:
            dscr = ebitda / debt_service

    missing_for_leverage = [name for name, value in (("TOTAL_DEBT", total_debt), ("EBITDA", ebitda)) if value is None]
    leverage = None
    leverage_reason = _missing_reason(missing=missing_for_leverage)
    if not missing_for_leverage:
        if ebitda == 0:
            leverage_reason = "EBITDA is zero for this period"
        else:
            leverage = total_debt / ebitda

    return [
        MetricResult("dscr", dscr, dscr_reason, missing_taxonomy_codes=missing_for_dscr or None),
        MetricResult("leverage_ratio", leverage, leverage_reason, missing_taxonomy_codes=missing_for_leverage or None),
    ]
