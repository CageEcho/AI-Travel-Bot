"""多轮引导（规则层）：冲突优先、缺失按优先级、就绪判定、模型问题越界过滤。"""
from app.schemas.slots import Conflict, Followup, SlotSet, SlotValue
from app.services.guidance import _sanitize_llm_questions, build_next_step, rule_followups, summarize


def _slots(**kv):
    return SlotSet(**{k: SlotValue(value=v, source="client_verbatim", confidence=0.9) for k, v in kv.items()})


def test_empty_card_asks_structure_first_and_not_ready():
    step = build_next_step(SlotSet(), [], use_llm=False)
    assert step.ready is False
    assert [f.slot for f in step.followups] == ["destination_cities", "date_start", "duration_days"]
    assert step.followups[0].options == ["东京", "京都", "箱根"]


def test_conflict_question_comes_first():
    slots = _slots(destination_cities=["京都"], date_start="2026-10-15", duration_days=10, adults=4, children=0, budget_amount=80000, hotel_tier=["5star"])
    c = Conflict(code="C1", slots=["budget_amount", "hotel_tier", "duration_days"], message="预算偏低", suggestion="提高预算或降档")
    step = build_next_step(slots, [c], use_llm=False)
    assert step.followups[0].slot == "budget_amount" and "冲突" in step.followups[0].question
    assert "C1" in step.analysis


def test_children_zero_skips_child_ages():
    slots = _slots(destination_cities=["东京"], date_start="2026-10-15", duration_days=5, adults=2, children=0)
    fus = rule_followups(slots, ["child_ages", "budget_amount"], [])
    assert [f.slot for f in fus] == ["budget_amount"]


def test_ready_when_complete_and_no_conflict():
    slots = _slots(destination_cities=["东京", "京都"], date_start="2026-10-15", duration_days=7, adults=2, children=1, child_ages=[5],
                   budget_amount=150000, budget_basis="total", budget_incl_flight="no", hotel_tier=["luxury"], dietary=["no_raw"], accessibility="none")
    step = build_next_step(slots, [], use_llm=False)
    assert step.ready is True and step.followups == []
    assert "东京、京都" in step.summary and "150,000" in step.summary and "忌生食" in step.summary


def test_llm_questions_sanitized_to_allowed_slots_and_valid_options():
    qs = [Followup(slot="hotel_tier", question="住哪档？", options=["五星", "六星", "奢华"]),
          Followup(slot="adults", question="几位？", options=[]),               # 已知槽位 → 过滤
          Followup(slot="budget_basis", question="口径？", options=["随便"])]    # 选项全不合法 → 用模板选项
    out = _sanitize_llm_questions(qs, allowed_slots={"hotel_tier", "budget_basis"})
    assert [q.slot for q in out] == ["hotel_tier", "budget_basis"]
    assert out[0].options == ["五星", "奢华"]
    assert out[1].options == ["总预算", "每人"]


def test_preferred_followups_from_extraction_used_without_llm():
    slots = _slots(adults=2, children=1, child_ages=[5], duration_days=7, budget_amount=150000)
    pref = [Followup(slot="destination_cities", question="想去哪些城市？", options=["东京", "京都", "箱根"]),
            Followup(slot="budget_basis", question="15 万是总预算还是每人？", options=["总预算", "每人"])]
    step = build_next_step(slots, [], use_llm=False, preferred=pref, analysis_hint="两大一小，注意旅馆年龄限制。")
    assert step.source == "llm" and step.analysis.startswith("两大一小")
    assert [f.slot for f in step.followups][:2] == ["destination_cities", "budget_basis"]
    assert len(step.followups) == 3          # 规则层补足到 3


def test_summary_handles_partial():
    assert summarize(_slots(adults=2)) == "2 成人"
