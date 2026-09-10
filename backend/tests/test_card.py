"""需求卡逻辑：合并优先级、完整度、追问截取、金额归一化与强类型边界。"""
import pytest
from pydantic import ValidationError
from app.schemas.slots import Followup, SlotExtraction, SlotSet, SlotValue, normalize_amount
from app.services.card import cap_followups, completeness, merge_slots


def sv(v, source="client_verbatim"):
    return SlotValue(value=v, source=source, confidence=0.9)


def test_amount_normalization():
    assert normalize_amount("15万") == 150000
    assert normalize_amount("150,000") == 150000
    assert normalize_amount("15w") == 150000
    assert normalize_amount("约15万左右") == 150000
    assert SlotValue(value="15万", source="client_verbatim", confidence=1).value == 150000


def test_advisor_input_wins_over_model():
    existing = SlotSet(adults=sv(2, "advisor_input"), children=sv(1))
    extracted = SlotSet(adults=sv(3), children=sv(2), pace=sv("relaxed"))
    m = merge_slots(existing, extracted)
    assert m.adults.value == 2 and m.children.value == 2 and m.pace.value == "relaxed"


def test_completeness_child_ages_only_required_with_children():
    s = SlotSet(destination_cities=sv(["京都"]), date_start=sv("2026-10-15"), duration_days=sv(4), adults=sv(2), children=sv(0),
                budget_amount=sv(100000), budget_basis=sv("total"), budget_incl_flight=sv("no"), hotel_tier=sv("5star"),
                dietary=sv(["none"]), accessibility=sv("none"))
    c, missing = completeness(s)
    assert c == 1.0 and missing == []
    s.children = sv(1)
    c, missing = completeness(s)
    assert missing == ["child_ages"] and c < 1.0


def test_followups_capped_not_rejected():
    ext = SlotExtraction(slots=SlotSet(), followups=[Followup(slot=f"s{i}", question="q") for i in range(5)])
    capped, warnings = cap_followups(ext)
    assert len(capped.followups) == 3 and warnings and "5 个追问" in warnings[0]


@pytest.mark.parametrize("slot,value", [
    ("adults", "很多"),
    ("destination_cities", 42),
    ("budget_basis", "banana"),
    ("child_ages", ["five"]),
    ("date_start", "2026-02-30"),
])
def test_slot_set_rejects_wrong_field_types_and_values(slot, value):
    with pytest.raises(ValidationError):
        SlotSet(**{slot: SlotValue(value=value, source="client_verbatim", confidence=0.9)})
