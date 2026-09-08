"""3 条冲突规则各 1 个命中用例。"""
from app.schemas.slots import SlotSet, SlotValue
from app.services.conflicts import detect_conflicts


def slots(**kw) -> SlotSet:
    return SlotSet(**{k: SlotValue(value=v, source="client_verbatim", confidence=1.0) for k, v in kw.items()})


def test_c1_budget_vs_tier():
    """PRD 验证点 7：「8万 / 4人 / 5星 / 10天」→ 命中预算×档次冲突。"""
    cs = detect_conflicts(slots(budget_amount=80000, budget_basis="total", adults=4, children=0, duration_days=10, hotel_tier="5star",
                                destination_cities=["东京", "京都"]))
    codes = [c.code for c in cs]
    assert "C1" in codes and "C2" not in codes           # 4 成人同时触发 C3（需 2 间房）属合理


def test_c2_days_vs_cities():
    cs = detect_conflicts(slots(duration_days=4, destination_cities=["东京", "箱根", "京都"], adults=2))
    assert any(c.code == "C2" for c in cs)


def test_c3_room_vs_pax():
    cs = detect_conflicts(slots(adults=4, children=2, child_ages=[5, 8], hotel_tier="luxury"))
    assert any(c.code == "C3" and "间房" in c.message for c in cs)


def test_c3_ryokan_with_toddler():
    cs = detect_conflicts(slots(adults=2, children=1, child_ages=[3], hotel_tier="ryokan"))
    assert any(c.code == "C3" for c in cs)


def test_no_conflict_for_reasonable_card():
    cs = detect_conflicts(slots(budget_amount=150000, budget_basis="total", adults=2, children=1, child_ages=[5],
                                duration_days=7, hotel_tier=["5star", "luxury"], destination_cities=["东京", "京都"]))
    assert cs == []
