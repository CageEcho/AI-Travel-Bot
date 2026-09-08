"""防线②：候选池外的假 resource_id 必须被拦截；防线③：回填字段与库值不一致必须被拦截。"""
from datetime import date, timedelta

from app.schemas.facts import TripContext
from app.schemas.plan import ItineraryPlan, PlannedDay, PlannedItem
from app.services.render import render_plan
from app.services.retrieval import build_pool

CTX = TripContext(adults=2, children=1, child_ages=[5], dietary=["no_raw"])


def _pool(db):
    return build_pool(db, ["京都"], date(2026, 10, 15), date(2026, 10, 17), CTX, ["5star", "luxury"])


def test_fake_resource_id_blocked(db):
    pool = _pool(db)
    real_rest = pool.restaurants[0]["rest_id"]
    plan = ItineraryPlan(days=[PlannedDay(day_index=1, date="2026-10-15", city="京都", theme="t", items=[
        PlannedItem(slot="lunch", type="restaurant", resource_id=real_rest, start_time="12:30"),
        PlannedItem(slot="afternoon", type="poi", resource_id="POI-KYO-999", start_time="14:00"),       # 看起来合理但不存在
        PlannedItem(slot="dinner", type="restaurant", resource_id="RST-TYO-001", start_time="18:30"),  # 真实存在但不在本次候选池（东京）
    ])])
    rendered, violations, _ = render_plan(db, plan, pool, CTX)
    items = rendered.days[0].items
    assert items[0].status == "ok"
    assert items[1].status == "blocked" and items[2].status == "blocked"
    kinds = {e.kind for e in rendered.render_errors}
    assert kinds == {"id_not_in_pool"}
    ref = [v for v in violations if v.code == "REF"]
    assert len(ref) == 2 and all(v.blocking for v in ref)


def test_hotel_room_not_in_pool_blocked(db):
    pool = _pool(db)
    h = pool.hotels[0]
    plan = ItineraryPlan(days=[PlannedDay(day_index=1, date="2026-10-15", city="京都", theme="t", items=[
        PlannedItem(slot="accommodation", type="hotel", resource_id=h.hotel_id, room_id="RM-FAKE-1", nights=2)])])
    rendered, violations, _ = render_plan(db, plan, pool, CTX)
    assert rendered.days[0].items[0].status == "blocked"
    assert any(v.code == "REF" and v.blocking for v in violations)


def test_field_mismatch_blocked(db):
    """防线③：候选池快照与库值不一致（模拟检索后数据被改 / 被篡改）。"""
    pool = _pool(db)
    r = pool.restaurants[0]
    r["closed_days"] = [0, 1, 2, 3]            # 篡改快照
    plan = ItineraryPlan(days=[PlannedDay(day_index=1, date="2026-10-15", city="京都", theme="t", items=[
        PlannedItem(slot="lunch", type="restaurant", resource_id=r["rest_id"], start_time="12:30")])])
    rendered, violations, _ = render_plan(db, plan, pool, CTX)
    assert rendered.days[0].items[0].status == "blocked"
    assert rendered.render_errors[0].kind == "field_mismatch"
    assert any(v.code == "REF" and v.blocking for v in violations)


def test_valid_plan_backfills_facts_not_from_model(db):
    pool = _pool(db)
    h = pool.hotels[0]
    plan = ItineraryPlan(days=[PlannedDay(day_index=1, date="2026-10-15", city="京都", theme="t", items=[
        PlannedItem(slot="accommodation", type="hotel", resource_id=h.hotel_id, room_id=h.room_id, nights=2,
                    reason_slots=["hotel_tier"], reason_note="ok")])])
    rendered, violations, rates = render_plan(db, plan, pool, CTX)
    it = rendered.days[0].items[0]
    assert it.status == "ok" and it.name_zh == h.name_zh and it.facts["max_occupancy"] == h.max_occupancy
    assert it.provenance and it.provenance.resource_id == h.hotel_id and it.provenance.rate_id
    assert h.room_id in rates
    assert not any(v.blocking for v in violations)
