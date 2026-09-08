"""7 条硬约束 × (PASS / FAIL / UNKNOWN) = 21 个单测。UNKNOWN 部分是本阶段的技术核心：证明空值没有被当作通过。"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.schemas.common import Verdict
from app.schemas.facts import PoiFacts, RateFacts, RestaurantFacts, RoomFacts, TripContext, VehicleFacts
from app.services import constraints as C

NOW = datetime(2026, 9, 7, tzinfo=timezone.utc)
FAMILY = TripContext(adults=2, children=1, child_ages=[5], dietary=["no_raw"])
COUPLE = TripContext(adults=2)


def room(**kw) -> RoomFacts:
    base = dict(hotel_id="H", room_id="R", max_occupancy=3, max_adults=2, max_children=1, min_child_age=0)
    base.update(kw)
    return RoomFacts(**base)


def rate(**kw) -> RateFacts:
    base = dict(rate_id="RP", resource_type="room", resource_id="R", valid_from=date(2026, 10, 1), valid_to=date(2026, 11, 30),
                net_price=Decimal("10000"), price_basis="per_room_night", confidence="contracted", updated_at=NOW - timedelta(days=10))
    base.update(kw)
    return RateFacts(**base)


# ── H1 房型容量 + 儿童年龄 ──
def test_h1_pass():
    assert C.h1_room_capacity(room(min_child_age=0), FAMILY) is None


def test_h1_fail_capacity():
    v = C.h1_room_capacity(room(max_occupancy=2), FAMILY)
    assert v and v.verdict == Verdict.FAIL and v.blocking and "最大入住 2" in v.message


def test_h1_fail_child_age():
    v = C.h1_room_capacity(room(min_child_age=7), FAMILY)
    assert v and v.verdict == Verdict.FAIL and "7 岁以上" in v.message


def test_h1_unknown_min_child_age_null():
    """⭐ min_child_age IS NULL + 有儿童 → UNKNOWN，不得静默通过。"""
    v = C.h1_room_capacity(room(min_child_age=None), FAMILY)
    assert v is not None and v.verdict == Verdict.UNKNOWN and v.blocking is False and v.verify_hint


def test_h1_null_without_children_passes():
    assert C.h1_room_capacity(room(min_child_age=None), COUPLE) is None


# ── H2 饮食禁忌 ──
def test_h2_pass():
    assert C.h2_dietary(RestaurantFacts(rest_id="X", closed_days=[], dietary_support=["no_raw", "vegetarian"]), FAMILY) is None


def test_h2_fail():
    v = C.h2_dietary(RestaurantFacts(rest_id="X", closed_days=[], dietary_support=["vegetarian"]), FAMILY)
    assert v and v.verdict == Verdict.FAIL and "no_raw" in v.message


def test_h2_unknown_empty_support():
    v = C.h2_dietary(RestaurantFacts(rest_id="X", closed_days=[], dietary_support=[]), FAMILY)
    assert v and v.verdict == Verdict.UNKNOWN and not v.blocking


# ── H3 营业日 ──
MONDAY = date(2026, 10, 19)


def test_h3_pass():
    assert C.h3_poi(PoiFacts(poi_id="P", closed_days=[1]), MONDAY + timedelta(days=1), "10:00") is None


def test_h3_fail_closed_monday():
    v = C.h3_poi(PoiFacts(poi_id="P", closed_days=[1]), MONDAY, "10:00")
    assert v and v.verdict == Verdict.FAIL and "周一" in v.message


def test_h3_fail_outside_hours():
    v = C.h3_restaurant(RestaurantFacts(rest_id="R", closed_days=[], open_from=time(11, 30), open_to=time(22, 0)), MONDAY, "23:00")
    assert v and v.verdict == Verdict.FAIL


def test_h3_unknown_closed_days_null():
    """⭐ closed_days IS NULL → UNKNOWN（不得视为全年无休）。"""
    v = C.h3_poi(PoiFacts(poi_id="P", closed_days=None), MONDAY, "10:00")
    assert v and v.verdict == Verdict.UNKNOWN and not v.blocking


# ── H4 车辆座位 AND 行李 ──
def test_h4_pass():
    assert C.h4_vehicle(VehicleFacts(vehicle_id="V", seats=6, luggage_28=4), FAMILY) is None


def test_h4_fail_luggage_only():
    """T7：座位够但行李不够。"""
    ctx = TripContext(adults=4, children=2, child_ages=[5, 8])   # pax 6, 行李估 5
    v = C.h4_vehicle(VehicleFacts(vehicle_id="V", seats=7, luggage_28=3), ctx)
    assert v and v.verdict == Verdict.FAIL and "行李" in v.message


def test_h4_unknown_luggage_null():
    v = C.h4_vehicle(VehicleFacts(vehicle_id="V", seats=6, luggage_28=None), FAMILY)
    assert v and v.verdict == Verdict.UNKNOWN and not v.blocking


# ── H5 同日通勤 ──
GION = (35.003, 135.775)
ARASHIYAMA = (35.013, 135.677)
HAKONE = (35.248, 139.045)


def test_h5_pass():
    assert C.h5_commute([GION, ARASHIYAMA, GION], "京都", False) is None


def test_h5_fail_cross_city():
    """T12：箱根↔京都同日安排必然超阈值。"""
    v = C.h5_commute([HAKONE, GION], "京都", True)
    assert v and v.verdict == Verdict.FAIL and "超过上限" in v.message


def test_h5_unknown_missing_coords():
    v = C.h5_commute([GION, None, ARASHIYAMA], "京都", False)
    assert v and v.verdict == Verdict.UNKNOWN


# ── H8 可售期 ──
def test_h8_pass():
    assert C.h8_availability(rate(), date(2026, 10, 15), date(2026, 10, 17), "R") is None


def test_h8_fail_expired():
    v = C.h8_availability(rate(valid_from=date(2025, 10, 1), valid_to=date(2026, 3, 31)), date(2026, 10, 15), date(2026, 10, 17), "R")
    assert v and v.verdict == Verdict.FAIL


def test_h8_fail_blackout():
    v = C.h8_availability(rate(blackout_dates=[date(2026, 10, 16)]), date(2026, 10, 15), date(2026, 10, 17), "R")
    assert v and v.verdict == Verdict.FAIL and "blackout" in v.message


def test_h8_unknown_no_rate():
    v = C.h8_availability(None, date(2026, 10, 15), date(2026, 10, 17), "R")
    assert v and v.verdict == Verdict.UNKNOWN


# ── H11 价格来源 ──
def test_h11_pass():
    assert C.h11_price_source(rate(), "R", NOW) is None


def test_h11_fail_severely_stale():
    v = C.h11_price_source(rate(updated_at=NOW - timedelta(days=200)), "R", NOW)
    assert v and v.verdict == Verdict.FAIL and v.blocking


def test_h11_unknown_reference_price():
    """T9：参考价且超 90 天 → UNKNOWN，进待核实清单。"""
    v = C.h11_price_source(rate(confidence="reference", updated_at=NOW - timedelta(days=129)), "R", NOW)
    assert v and v.verdict == Verdict.UNKNOWN and not v.blocking and v.verify_hint


def test_h11_unknown_contracted_but_stale():
    v = C.h11_price_source(rate(updated_at=NOW - timedelta(days=100)), "R", NOW)
    assert v and v.verdict == Verdict.UNKNOWN
