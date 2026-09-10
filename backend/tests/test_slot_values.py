"""槽位取值归一化：顾问点的选项原文 / 手填值必须归一到规范枚举，不合法要拒绝。"""
import pytest

from app.services.card import set_slot
from app.schemas.slots import SlotSet
from app.services.slot_values import normalize_slot_value


@pytest.mark.parametrize("slot,raw,expected", [
    ("budget_basis", "两人总计", "total"), ("budget_basis", "每人", "per_person"), ("budget_basis", "人均（按大人算）", "per_person"),
    ("budget_incl_flight", "不含机票", "no"), ("budget_incl_flight", "还没定", "undecided"),
    ("hotel_tier", ["五星", "奢华"], ["5star", "luxury"]), ("hotel_tier", "高端温泉旅馆", ["ryokan"]),
    ("dietary", "无禁忌", ["none"]), ("dietary", ["忌生食", "无"], ["no_raw"]), ("dietary", "不吃海鲜", ["no_shellfish"]),
    ("accessibility", "老人慢行", "elderly_slow"), ("accessibility", "无", "none"),
    ("destination_cities", "东京、京都", ["东京", "京都"]), ("destination_cities", ["Tokyo"], ["东京"]),
    ("adults", "3人", 3), ("budget_amount", "15万", 150000), ("child_ages", "5, 8岁", [5, 8]),
    ("date_start", "2026/10/15", "2026-10-15"), ("date_start", "2026年10月15日", "2026-10-15"), ("date_end", "10.22", f"{__import__('datetime').date.today().year}-10-22"),
    ("pace", "紧凑", "packed"),
])
def test_normalize_ok(slot, raw, expected):
    assert normalize_slot_value(slot, raw) == expected


@pytest.mark.parametrize("slot,raw", [
    ("budget_basis", "随便"), ("hotel_tier", "六星"), ("adults", 0), ("child_ages", [25]), ("date_start", "十月中旬"), ("duration_days", "很多天"),
])
def test_normalize_rejects(slot, raw):
    with pytest.raises(ValueError):
        normalize_slot_value(slot, raw)


def test_set_slot_stores_canonical_and_clear():
    s = set_slot(SlotSet(), "budget_basis", "全家总价")
    assert s.budget_basis.value == "total" and s.budget_basis.source == "advisor_input"
    assert set_slot(s, "budget_basis", None).budget_basis is None
