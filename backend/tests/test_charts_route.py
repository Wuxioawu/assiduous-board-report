from app.api.v1.routes.charts import _degrade_line_charts_with_too_few_points
from app.schemas.chart import ChartConfig, ChartPoint, ChartSeries


def _line_config(point_counts: list[int]) -> ChartConfig:
    series = [ChartSeries(label=f"s{i}", points=[ChartPoint(value=1, source_refs=[])] * n) for i, n in enumerate(point_counts)]
    return ChartConfig(
        id="x", display_name="X", chart_type="line", audiences=["management"], format="currency", series=series
    )


def test_line_chart_with_fewer_than_three_points_degrades_to_grouped_bar():
    config = _line_config([2])
    degraded = _degrade_line_charts_with_too_few_points(config)
    assert degraded.chart_type == "grouped_bar"


def test_line_chart_with_three_or_more_points_stays_a_line():
    config = _line_config([3])
    assert _degrade_line_charts_with_too_few_points(config).chart_type == "line"


def test_degradation_uses_the_longest_series_not_the_shortest():
    # growth_vs_target has two series (actual + target line) of equal length
    # in practice, but the rule should look at whichever is longest in
    # general, not assume they match.
    config = _line_config([2, 4])
    assert _degrade_line_charts_with_too_few_points(config).chart_type == "line"


def test_non_line_charts_are_never_touched():
    waterfall_config = _line_config([1]).model_copy(update={"chart_type": "waterfall"})
    assert _degrade_line_charts_with_too_few_points(waterfall_config).chart_type == "waterfall"
