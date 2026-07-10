from app.services.extraction.currency import detect_reporting_currency


def test_empty_batch_returns_none():
    assert detect_reporting_currency([]) is None


def test_single_currency_is_detected():
    assert detect_reporting_currency(["EUR", "EUR", "EUR"]) == "EUR"


def test_majority_currency_wins_over_stray_outliers():
    assert detect_reporting_currency(["EUR", "EUR", "EUR", "USD"]) == "EUR"


def test_ties_break_to_first_occurrence():
    assert detect_reporting_currency(["GBP", "USD"]) == "GBP"
