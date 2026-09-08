"""必问项确定性兜底：不靠模型自觉。"""
from app.schemas.slots import Followup, SlotExtraction, SlotSet, SlotValue
from app.services.card import ensure_must_ask


def _ext(followups, **slots):
    return SlotExtraction(slots=SlotSet(**{k: SlotValue(value=v, source="client_verbatim", confidence=0.9) for k, v in slots.items()}),
                          followups=followups)


def test_dietary_hint_forces_dietary_first():
    ext = _ext([Followup(slot="destination_cities", question="去哪？", options=["东京"]),
                Followup(slot="budget_basis", question="口径？", options=["总预算"]),
                Followup(slot="budget_incl_flight", question="含机票？", options=["含"])])
    out, warns = ensure_must_ask(ext, "老人肠胃不好，这次不去。", None)
    assert out.followups[0].slot == "dietary"
    assert len(out.followups) == 3
    assert any("dietary" in w for w in warns)


def test_no_hint_no_injection_when_full():
    ext = _ext([Followup(slot="destination_cities", question="q"), Followup(slot="hotel_tier", question="q"), Followup(slot="pace", question="q")])
    out, warns = ensure_must_ask(ext, "两个人去东京玩五天", None)
    assert [f.slot for f in out.followups] == ["destination_cities", "hotel_tier", "pace"]
    assert warns == []


def test_missing_must_ask_filled_when_room():
    out, warns = ensure_must_ask(_ext([]), "两个人去东京玩五天", None)
    assert [f.slot for f in out.followups] == ["dietary", "accessibility", "budget_basis"]


def test_known_or_advisor_confirmed_not_asked():
    existing = SlotSet(dietary=SlotValue(value=["none"], source="advisor_input", confidence=1.0))
    out, _ = ensure_must_ask(_ext([], accessibility="none", budget_basis="total"), "肠胃不好", existing)
    assert out.followups == []
