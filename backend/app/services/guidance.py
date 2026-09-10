"""多轮引导式需求采集：根据当前需求卡，给顾问「下一步该确认什么」。

规则层保证一定有可用的下一问（模板 + 缺失优先级 + 冲突优先）；
模型层（可选）负责用顾问口吻写分析与问题。模型失败 / 越界时回落到规则层，不阻塞。
"""
from __future__ import annotations

import json
import logging
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.llm import load_prompt, parse_structured
from app.schemas.slots import Conflict, Followup, NextStepView, SlotSet
from app.services.card import can_confirm, completeness
from app.services.slot_values import ENUM_SLOTS, _norm_enum, label_of, options_for

log = logging.getLogger("app.guidance")

# 追问优先级：先结构性（去哪 / 几天 / 几人），再预算口径，再档次，再必问三项，偏好类不主动问
PRIORITY = ["destination_cities", "date_start", "duration_days", "adults", "children", "child_ages",
            "budget_amount", "budget_basis", "budget_incl_flight", "hotel_tier", "dietary", "accessibility"]

TEMPLATES: dict[str, Followup] = {
    "destination_cities": Followup(slot="destination_cities", question="这次日本行想去哪些城市？（可多选）", options=options_for("destination_cities")),
    "date_start": Followup(slot="date_start", question="大概几号出发？请给一个具体日期（YYYY-MM-DD）", options=[]),
    "duration_days": Followup(slot="duration_days", question="行程总共几天？", options=["5", "6", "7", "8", "10"]),
    "adults": Followup(slot="adults", question="同行成人几位？", options=["1", "2", "3", "4"]),
    "children": Followup(slot="children", question="有几位儿童同行？没有请选 0", options=["0", "1", "2", "3"]),
    "child_ages": Followup(slot="child_ages", question="孩子分别几岁？多个用逗号分隔", options=[]),
    "budget_amount": Followup(slot="budget_amount", question="预算大约多少（人民币元）？", options=["50000", "100000", "150000", "200000", "300000"]),
    "budget_basis": Followup(slot="budget_basis", question="这个预算是全家总预算还是每人？", options=options_for("budget_basis")),
    "budget_incl_flight": Followup(slot="budget_incl_flight", question="预算是否包含国际机票？", options=options_for("budget_incl_flight")),
    "hotel_tier": Followup(slot="hotel_tier", question="酒店想住哪个档次？（可多选）", options=options_for("hotel_tier")),
    "dietary": Followup(slot="dietary", question="一家人饮食上有什么禁忌或偏好需要安排吗？（可多选）", options=options_for("dietary")),
    "accessibility": Followup(slot="accessibility", question="同行人是否有无障碍或慢行需求？", options=options_for("accessibility")),
}
CONFLICT_QUESTION: dict[str, tuple[str, str]] = {
    # code → (要改的槽位, 问法)
    "C1": ("budget_amount", "预算与酒店档次 / 天数有冲突：{message}。客户更倾向提高预算，还是降低档次或缩短天数？如提高预算，请填新的预算金额（元）"),
    "C2": ("duration_days", "天数与城市数不匹配：{message}。是减少城市，还是增加天数？请确认总天数"),
    "C3": ("hotel_tier", "房型与人数可能不匹配：{message}。是否接受两间房，或调整档次？请确认酒店档次"),
}


NextStep = NextStepView   # analysis / followups(≤3，前端一次只展示第一个) / ready / summary / source


class Guidance(BaseModel):
    """模型输出结构。"""
    analysis: str = ""
    questions: list[Followup] = Field(default_factory=list)


def summarize(slots: SlotSet) -> str:
    parts: list[str] = []
    cities = slots.get("destination_cities")
    if cities:
        parts.append("、".join(cities) if isinstance(cities, list) else str(cities))
    if slots.get("date_start"):
        parts.append(f"{slots.get('date_start')} 出发")
    if slots.get("duration_days"):
        parts.append(f"{slots.get('duration_days')} 天")
    if slots.get("adults") is not None:
        kids = slots.get("children") or 0
        ages = slots.get("child_ages") or []
        parts.append(f"{slots.get('adults')} 成人" + (f" + {kids} 儿童（{'、'.join(str(a) for a in ages)} 岁）" if kids else ""))
    if slots.get("budget_amount"):
        basis = label_of(slots.get("budget_basis")) if slots.get("budget_basis") else ""
        fl = label_of(slots.get("budget_incl_flight")) if slots.get("budget_incl_flight") else ""
        parts.append(f"预算 {int(slots.get('budget_amount')):,} 元" + (f"（{basis}{'，' + fl if fl else ''}）" if basis or fl else ""))
    tier = slots.get("hotel_tier")
    if tier:
        parts.append("住" + "、".join(label_of(t) for t in (tier if isinstance(tier, list) else [tier])))
    diet = slots.get("dietary")
    if diet:
        parts.append("饮食：" + "、".join(label_of(d) for d in (diet if isinstance(diet, list) else [diet])))
    acc = slots.get("accessibility")
    if acc and acc != "none":
        parts.append("无障碍：" + label_of(acc))
    return "；".join(parts) if parts else "尚未采集到有效信息"


def rule_followups(slots: SlotSet, missing: list[str], conflicts: list[Conflict], limit: int = 3) -> list[Followup]:
    out: list[Followup] = []
    for c in conflicts:
        if c.code in CONFLICT_QUESTION:
            slot, q = CONFLICT_QUESTION[c.code]
            out.append(Followup(slot=slot, question=q.format(message=c.message), options=TEMPLATES[slot].options if slot != "budget_amount" else []))
    ordered = [m for m in PRIORITY if m in missing]
    # children=0 时不问 child_ages（completeness 已处理，这里再保险）
    if slots.get("children") == 0:
        ordered = [m for m in ordered if m != "child_ages"]
    for m in ordered:
        if m in TEMPLATES and all(f.slot != m for f in out):
            out.append(TEMPLATES[m])
    return out[:limit]


def _sanitize_llm_questions(qs: list[Followup], allowed_slots: set[str]) -> list[Followup]:
    """模型问题越界过滤：只保留允许的槽位；枚举槽位的选项必须能归一化，否则用模板选项。"""
    out: list[Followup] = []
    for q in qs:
        if q.slot not in allowed_slots or any(x.slot == q.slot for x in out):
            continue
        if q.slot in ENUM_SLOTS:
            good = []
            for o in q.options:
                try:
                    _norm_enum(q.slot, o)
                    good.append(o)
                except ValueError:
                    pass
            q = q.model_copy(update={"options": good or TEMPLATES[q.slot].options})
        elif q.slot in TEMPLATES and not q.options:
            q = q.model_copy(update={"options": TEMPLATES[q.slot].options})
        out.append(q)
    return out[:3]


def build_next_step(slots: SlotSet, conflicts: list[Conflict], *, use_llm: bool = True,
                    preferred: list[Followup] | None = None, analysis_hint: str = "") -> NextStep:
    """生成下一步。preferred：本轮抽取模型已经给出的追问（优先采用，省一次调用）。"""
    comp, missing = completeness(slots)
    ready, _ = can_confirm(slots, conflicts)
    summary = summarize(slots)
    allowed = set(missing) | {CONFLICT_QUESTION[c.code][0] for c in conflicts if c.code in CONFLICT_QUESTION}
    rules = rule_followups(slots, missing, conflicts)

    if ready:
        return NextStep(analysis=analysis_hint or f"信息已齐全：{summary}。可以确认需求卡并生成方案。",
                        followups=[], ready=True, summary=summary, source="rules")

    if preferred:
        qs = _sanitize_llm_questions(preferred, allowed)
        # 冲突问题优先插到最前
        conflict_qs = [f for f in rules if f.slot in {CONFLICT_QUESTION[c.code][0] for c in conflicts if c.code in CONFLICT_QUESTION}]
        merged = conflict_qs + [q for q in qs if all(q.slot != c.slot for c in conflict_qs)]
        merged += [r for r in rules if all(r.slot != m.slot for m in merged)]
        return NextStep(analysis=analysis_hint or _rules_analysis(missing, conflicts), followups=merged[:3], ready=False,
                        summary=summary, source="llm" if qs else "rules")

    if use_llm and settings.planner_mode == "llm":
        try:
            user = (f"<card>\n{json.dumps({'slots': json.loads(slots.model_dump_json(exclude_none=True)), 'completeness': round(comp, 2)}, ensure_ascii=False)}\n</card>\n"
                    f"<missing>\n{json.dumps(missing, ensure_ascii=False)}\n</missing>\n"
                    f"<conflicts>\n{json.dumps([c.model_dump() for c in conflicts], ensure_ascii=False)}\n</conflicts>\n"
                    f"<options>\n{json.dumps({s: options_for(s) for s in ENUM_SLOTS}, ensure_ascii=False)}\n</options>")
            res = parse_structured(system=load_prompt("next_step.md"), user=user, output_format=Guidance, max_tokens=2000)
            g = res.parsed
            assert isinstance(g, Guidance)
            qs = _sanitize_llm_questions(g.questions, allowed)
            conflict_qs = [f for f in rules if f.slot in {CONFLICT_QUESTION[c.code][0] for c in conflicts if c.code in CONFLICT_QUESTION}]
            merged = conflict_qs + [q for q in qs if all(q.slot != c.slot for c in conflict_qs)]
            merged += [r for r in rules if all(r.slot != m.slot for m in merged)]
            return NextStep(analysis=(g.analysis or "").strip() or _rules_analysis(missing, conflicts), followups=merged[:3],
                            ready=False, summary=summary, source="llm")
        except Exception as e:  # 模型不可用不阻塞采集
            log.warning("next_step llm failed, fallback to rules: %s", type(e).__name__)

    return NextStep(analysis=_rules_analysis(missing, conflicts), followups=rules, ready=False, summary=summary, source="rules")


def _rules_analysis(missing: list[str], conflicts: list[Conflict]) -> str:
    from app.services.card import MUST_ASK
    parts = []
    if conflicts:
        parts.append("检测到 " + "、".join(c.code + " " + c.message for c in conflicts) + "，需先与客户确认")
    must = [m for m in missing if m in MUST_ASK]
    if must:
        parts.append("以下项不能默认为「无」，必须向客户确认：" + "、".join(label_slot(m) for m in must))
    rest = [m for m in missing if m not in MUST_ASK]
    if rest:
        parts.append("还缺：" + "、".join(label_slot(m) for m in rest))
    return "；".join(parts) + "。" if parts else "信息已齐全。"


SLOT_LABEL = {"destination_cities": "目的地", "date_start": "出发日期", "date_end": "结束日期", "duration_days": "天数", "adults": "成人数",
              "children": "儿童数", "child_ages": "儿童年龄", "budget_amount": "预算金额", "budget_basis": "预算口径",
              "budget_incl_flight": "是否含机票", "hotel_tier": "酒店档次", "dietary": "饮食禁忌", "accessibility": "无障碍需求",
              "interests": "兴趣偏好", "pace": "节奏"}


def label_slot(name: str) -> str:
    return SLOT_LABEL.get(name, name)
