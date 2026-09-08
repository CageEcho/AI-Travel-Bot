"""规则层端到端（确定性编排器）：G1 零 blocking、G2 全部条目有有效 resource_id、每天有住宿、陷阱资源不出现、G5 UNKNOWN 进 checklist。"""
from datetime import date, timedelta

from app.schemas.facts import TripContext
from app.schemas.slots import SlotSet, SlotValue
from app.services.planner import generate_with_validation, trip_dates
from app.services.retrieval import build_pool


def sv(v):
    return SlotValue(value=v, source="advisor_input", confidence=1.0)


def test_family_three_cities_seven_days(db):
    slots = SlotSet(destination_cities=sv(["东京", "箱根", "京都"]), date_start=sv("2026-10-15"), duration_days=sv(7), adults=sv(2),
                    children=sv(1), child_ages=sv([5]), budget_amount=sv(150000), budget_basis=sv("total"), hotel_tier=sv(["5star", "luxury"]),
                    dietary=sv(["no_raw"]), accessibility=sv("none"))
    ctx = TripContext.from_slots(slots)
    start, days = trip_dates(slots)
    pool = build_pool(db, ["东京", "箱根", "京都"], start, start + timedelta(days=days - 1), ctx, ["5star", "luxury"])
    r = generate_with_validation(db, slots, pool, ctx, mode="heuristic")
    assert len(r.rendered.days) == 7
    assert r.blocking_count == 0                                       # G1
    for d in r.rendered.days:
        assert d.items, f"Day {d.day_index} 空白"
        for it in d.items:
            if it.type not in ("free_time", "transfer"):
                assert it.resource_id and it.status == "ok"            # G2
                assert it.provenance and it.provenance.resource_id == it.resource_id
        if d.day_index < 7:
            assert any(it.type == "hotel" for it in d.items), f"Day {d.day_index} 无住宿"
    used = {it.resource_id for d in r.rendered.days for it in d.items if it.resource_id}
    assert not any("-T1-" in x or "-T2-" in x or "-T8-" in x or "-T7-" in x for x in used), used
    # 成本：只来自规则引擎；住宿行的 rule_trace 可下钻
    acc = [l for l in r.cost.lines if l.category == "accommodation"]
    assert acc and all("晚" in l.rule_trace for l in acc)
    assert r.cost.total > 0 and r.cost.breakdown["service_fee"] > 0
    # G5：UNKNOWN 项进待核实清单，且每项写清要核实什么
    assert r.unknown_count == len([c for c in r.checklist if c.code != "COST"])
    assert all(c.what_to_verify for c in r.checklist)


def test_replan_when_only_trap_hotels(db):
    """PRD 验证点 12：候选池里塞一个假的房型 → 引用校验拦截 → 触发重排；仍失败时显式报违规，不静默通过。"""
    slots = SlotSet(destination_cities=sv(["京都"]), date_start=sv("2026-10-15"), duration_days=sv(3), adults=sv(2), children=sv(1),
                    child_ages=sv([5]), hotel_tier=sv(["luxury"]), dietary=sv(["no_raw"]))
    ctx = TripContext.from_slots(slots)
    pool = build_pool(db, ["京都"], date(2026, 10, 15), date(2026, 10, 17), ctx, ["luxury"])
    # 把候选池里所有酒店的 room_id 替换为不存在的房型 → 防线②必拦
    for h in pool.hotels:
        h.room_id = "RM-GHOST-1"
    r = generate_with_validation(db, slots, pool, ctx, mode="heuristic")
    assert r.rounds == 3                       # 用满 3 轮
    assert r.blocking_count >= 1 and r.ref_blocked >= 1
    # 第 1 轮被防线②拦截（REF）；后续轮次该房型被禁用 → 无住宿 → 结构校验 S1 仍是 blocking，显式交人工，不静默通过
    assert any(v.code in ("REF", "S1") and v.blocking for v in r.violations)
