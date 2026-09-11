"""僵死任务的启动补偿逻辑：心跳超时的 running 任务 → failed / ORPHANED。"""
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Conversation, GenerationTask, RequirementCard
from app.core.config import settings
from app.schemas.facts import TripContext
from app.schemas.slots import SlotSet, SlotValue
from app.services.planner import trip_dates
from app.services.retrieval import build_pool
from app.services.tasks import candidate_recovery_details, expand_demo_hotel_coverage, recover_orphans, status_of


def _card(db) -> RequirementCard:
    conv = Conversation(conv_id="CNV-task-test")
    db.merge(conv)
    card = RequirementCard(card_id="CRD-task-test", conv_id="CNV-task-test", version=1,
                           slots=json.loads(SlotSet().model_dump_json()), completeness=0, conflicts=[], followups=[],
                           confirmed_at=datetime.now(timezone.utc))
    db.merge(card)
    db.commit()
    return card


def _sv(value):
    return SlotValue(value=value, source="advisor_input", confidence=1)


def test_orphaned_task_marked_failed(db):
    _card(db)
    old = datetime.now(timezone.utc) - timedelta(minutes=30)
    db.merge(GenerationTask(task_id="TSK-old", plan_id="PLN-old", card_id="CRD-task-test", status="planning", progress=0.4,
                            heartbeat_at=old, created_at=old))
    db.merge(GenerationTask(task_id="TSK-fresh", plan_id="PLN-fresh", card_id="CRD-task-test", status="planning", progress=0.4,
                            heartbeat_at=datetime.now(timezone.utc)))
    db.commit()
    n = recover_orphans(db, timeout_sec=300)
    assert n == 1
    st = status_of(db, "PLN-old")
    assert st.status == "failed" and st.error and st.error.code == "ORPHANED" and "重新生成" in st.error.message
    assert status_of(db, "PLN-fresh").status == "planning"   # 心跳新鲜的不受影响


def test_stalled_task_marked_failed_on_status_query(db):
    _card(db)
    stale = datetime.now(timezone.utc) - timedelta(seconds=600)
    db.merge(GenerationTask(task_id="TSK-stall", plan_id="PLN-stall", card_id="CRD-task-test", status="planning", progress=0.6,
                            replan_round=2, heartbeat_at=stale, created_at=stale))
    db.commit()
    st = status_of(db, "PLN-stall")          # 查询即判定，不等重启
    assert st.status == "failed" and st.error and st.error.code == "STALLED" and "重新生成" in st.error.message


@pytest.mark.parametrize("tier", ["4star", "5star", "luxury", "ryokan", "boutique"])
def test_demo_mode_covers_every_hotel_tier_choice(db, monkeypatch, tier):
    slots = SlotSet(destination_cities=_sv(["东京", "箱根", "京都"]), date_start=_sv("2026-10-15"), duration_days=_sv(7),
                    adults=_sv(2), children=_sv(1), child_ages=_sv([5]), hotel_tier=_sv([tier]),
                    dietary=_sv(["no_raw"]), accessibility=_sv("none"))
    ctx = TripContext.from_slots(slots)
    start, days = trip_dates(slots)
    end = start + timedelta(days=days - 1)
    cities = ["东京", "箱根", "京都"]
    pool = build_pool(db, cities, start, end, ctx, [tier])
    covered_before = {hotel.city for hotel in pool.hotels}
    missing_before = [city for city in cities if city not in covered_before]
    monkeypatch.setattr(settings, "demo_mode", True)

    relaxed = expand_demo_hotel_coverage(db, pool, cities, start, end, ctx, [tier])

    assert relaxed == missing_before
    assert {hotel.city for hotel in pool.hotels} == set(cities)
    assert all(not pool.hotel_hints.get(city) for city in relaxed)


def test_production_mode_never_expands_selected_tier(db, monkeypatch):
    slots = SlotSet(destination_cities=_sv(["箱根"]), date_start=_sv("2026-10-15"), duration_days=_sv(2),
                    adults=_sv(2), children=_sv(0), hotel_tier=_sv(["5star"]))
    ctx = TripContext.from_slots(slots)
    start, days = trip_dates(slots)
    end = start + timedelta(days=days - 1)
    pool = build_pool(db, ["箱根"], start, end, ctx, ["5star"])
    monkeypatch.setattr(settings, "demo_mode", False)

    assert expand_demo_hotel_coverage(db, pool, ["箱根"], start, end, ctx, ["5star"]) == []
    assert pool.hotels == []


def test_candidate_recovery_returns_executable_fields_without_fake_budget_hint(db, monkeypatch):
    slots = SlotSet(destination_cities=_sv(["东京", "箱根", "京都"]), date_start=_sv("2026-02-15"), duration_days=_sv(3),
                    adults=_sv(2), children=_sv(0), hotel_tier=_sv(["luxury"]))
    ctx = TripContext.from_slots(slots)
    start, days = trip_dates(slots)
    pool = build_pool(db, ["东京", "箱根", "京都"], start, start + timedelta(days=days - 1), ctx, ["luxury"])
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(settings, "demo_safe_date", "2026-10-15")

    details = candidate_recovery_details(slots, ["东京", "箱根", "京都"], pool, ["luxury"])

    assert details["kind"] == "candidate_recovery"
    assert details["actions"][0]["patches"] == [
        {"slot": "date_start", "value": "2026-10-15"},
        {"slot": "date_end", "value": None},
    ]
    assert all(patch["slot"] != "budget_amount" for action in details["actions"] for patch in action["patches"])


def test_failed_status_returns_persisted_recovery_details(db):
    card = _card(db)
    details = {"kind": "candidate_recovery", "problem_slots": ["date_start"], "actions": []}
    db.merge(GenerationTask(task_id="TSK-recover", plan_id="PLN-recover", card_id=card.card_id, status="failed", progress=0.1,
                            error_code="CANDIDATES_TOO_FEW", error_message="酒店不足", error_details=details,
                            heartbeat_at=datetime.now(timezone.utc)))
    db.commit()

    status = status_of(db, "PLN-recover")

    assert status.error and status.error.details == details


def test_legacy_failed_status_backfills_recovery_details(db):
    card = _card(db)
    db.merge(GenerationTask(task_id="TSK-legacy-recover", plan_id="PLN-legacy-recover", card_id=card.card_id, status="failed", progress=0.1,
                            error_code="CANDIDATES_TOO_FEW", error_message="酒店不足", error_details=None,
                            heartbeat_at=datetime.now(timezone.utc)))
    db.commit()

    status = status_of(db, "PLN-legacy-recover")

    assert status.error and status.error.details
    assert status.error.details["kind"] == "candidate_recovery"
