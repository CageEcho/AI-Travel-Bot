"""3 组手工算例（旺季上浮、儿童半价、服务费）逐分比对。"""
from datetime import date, datetime, timezone
from decimal import Decimal

from app.core.config import settings
from app.schemas.facts import RateFacts, TripContext
from app.services import cost as K

NOW = datetime(2026, 9, 1, tzinfo=timezone.utc)


def rate(rid, price, uplift="0", basis="per_room_night"):
    return RateFacts(rate_id=f"RP-{rid}", resource_type="x", resource_id=rid, valid_from=date(2026, 4, 1), valid_to=date(2027, 3, 31),
                     net_price=Decimal(price), price_basis=basis, season_uplift=Decimal(uplift), confidence="contracted", updated_at=NOW)


def test_accommodation_peak_uplift_manual():
    # 手工：98000 × 3 晚 × 1 间 × 1.18 = 346920.00
    line = K.line_accommodation(rate("RM1", "98000", "0.18"), nights=3, rooms=1)
    assert line.amount == Decimal("346920.00")
    assert "98000" in line.rule_trace and "3晚" in line.rule_trace and "0.18" in line.rule_trace


def test_dining_child_half_price_and_tickets_manual():
    # 手工：12000 × 2 + 12000 × 0.5 × 1 = 30000.00；门票 1600 × 3 = 4800.00
    d = K.line_dining(rate("R1", "12000", basis="per_person"), adults=2, children=1)
    t = K.line_tickets(rate("P1", "1600", basis="per_person"), pax=3)
    assert d.amount == Decimal("30000.00")
    assert t.amount == Decimal("4800.00")


def test_summary_service_fee_and_budget_variance_manual():
    assert settings.service_fee_rate == Decimal("0.08") and settings.fx_jpy_cny == Decimal("0.0479")
    ctx = TripContext(adults=2, children=1, child_ages=[5], budget_cny=Decimal("100000"), budget_basis="total")
    lines = [K.line_accommodation(rate("RM1", "98000", "0.18"), 3, 1),           # 346920.00
             K.line_transport(rate("V1", "58000", basis="per_car_day"), 2),      # 116000.00
             K.line_dining(rate("R1", "12000", basis="per_person"), 2, 1),       #  30000.00
             K.line_tickets(rate("P1", "1600", basis="per_person"), 3)]          #   4800.00
    s = K.summarize(lines, ctx)
    # 手工：小计 497720.00；服务费 497720 × 0.08 = 39817.60；总计 537537.60；人均 179179.20
    assert s.breakdown["service_fee"] == Decimal("39817.60")
    assert s.total == Decimal("537537.60")
    assert s.per_person == Decimal("179179.20")
    # 折人民币：537537.60 × 0.0479 = 25748.05（四舍五入到分）；预算 100000 → 偏差 -74.25%
    assert s.total_cny == Decimal("25748.05")
    assert s.variance_pct == Decimal("-74.25")
    assert s.fx_rate == Decimal("0.0479") and s.fx_time
