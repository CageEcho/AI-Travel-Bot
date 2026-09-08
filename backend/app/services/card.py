"""需求卡：槽位合并、完整度、缺失项。确定性代码。"""
from __future__ import annotations

from app.core.config import settings
from app.schemas.slots import Followup, SlotExtraction, SlotSet, SlotValue

# 完整度权重（合计 1.0）。interests / pace 不计入。
WEIGHTS: dict[str, float] = {
    "destination_cities": 0.12, "date_start": 0.10, "duration_days": 0.10, "adults": 0.10, "children": 0.08,
    "child_ages": 0.05, "budget_amount": 0.10, "budget_basis": 0.08, "budget_incl_flight": 0.05,
    "hotel_tier": 0.08, "dietary": 0.08, "accessibility": 0.06,
}
# 缺失时必须追问、不得静默假设为「无」的三项（PRD）
MUST_ASK = ("dietary", "accessibility", "budget_basis")


def merge_slots(existing: SlotSet, extracted: SlotSet) -> SlotSet:
    """顾问填写（advisor_input）优先级最高，不被模型改写；其余以新一轮非空值覆盖。"""
    merged = existing.model_copy(deep=True)
    for name in SlotSet.slot_names():
        old: SlotValue | None = getattr(existing, name)
        new: SlotValue | None = getattr(extracted, name)
        if old is not None and old.source == "advisor_input":
            continue
        if new is not None and new.value not in (None, "", []):
            setattr(merged, name, new)
    return merged


def set_slot(slots: SlotSet, name: str, value) -> SlotSet:
    if name not in SlotSet.slot_names():
        raise KeyError(name)
    out = slots.model_copy(deep=True)
    setattr(out, name, None if value is None else SlotValue(value=value, source="advisor_input", confidence=1.0))
    return out


def completeness(slots: SlotSet) -> tuple[float, list[str]]:
    """返回 (完整度 0..1, 缺失槽位列表)。children=0 时 child_ages 视为已满足。"""
    score = 0.0
    missing: list[str] = []
    children = slots.get("children")
    for name, w in WEIGHTS.items():
        val = slots.get(name)
        if name == "child_ages" and (children in (0, None) or children == 0):
            score += w if children == 0 else 0
            if children is None:
                missing.append(name)
            continue
        if val is None or val == "" or val == []:
            missing.append(name)
        else:
            score += w
    return round(min(score, 1.0), 3), missing


def can_confirm(slots: SlotSet) -> tuple[bool, float]:
    c, _ = completeness(slots)
    return c >= settings.completeness_threshold, c


DIETARY_HINTS = ("肠胃", "吃不惯", "生冷", "清淡", "忌口", "素食", "吃素", "清真", "过敏", "不吃", "不能吃", "海鲜")
DEFAULT_FOLLOWUP: dict[str, Followup] = {
    "dietary": Followup(slot="dietary", question="一家人饮食上有什么禁忌或偏好需要安排吗？", options=["忌生食", "素食", "清真", "无禁忌"]),
    "accessibility": Followup(slot="accessibility", question="同行人是否有无障碍或慢行需求？", options=["无", "轮椅", "老人慢行", "婴儿车"]),
    "budget_basis": Followup(slot="budget_basis", question="预算是全家总预算还是每人？", options=["总预算", "每人"]),
}


def _empty(sv: SlotValue | None) -> bool:
    return sv is None or sv.value in (None, "", [])


def ensure_must_ask(extraction: SlotExtraction, text: str, existing: SlotSet | None = None,
                    limit: int = 3) -> tuple[SlotExtraction, list[str]]:
    """确定性兜底（不靠模型自觉）：
    1) 原话含饮食暗示且 dietary 未知 → dietary 追问必须排第一；
    2) 必问三项（dietary / accessibility / budget_basis）缺失且本轮还有名额 → 补上默认追问。
    已由顾问确认或已抽到值的槽位不追问。"""
    warnings: list[str] = []
    fus = list(extraction.followups)

    def known(name: str) -> bool:
        if not _empty(getattr(extraction.slots, name)):
            return True
        ex = getattr(existing, name) if existing is not None else None
        return not _empty(ex)

    present = {f.slot for f in fus}
    if any(h in text for h in DIETARY_HINTS) and not known("dietary"):
        fus = [f for f in fus if f.slot != "dietary"]
        fus.insert(0, next((f for f in extraction.followups if f.slot == "dietary"), DEFAULT_FOLLOWUP["dietary"]))
        if "dietary" not in present:
            warnings.append("原话含饮食暗示但模型未追问 dietary，系统已补上并置顶")
        elif extraction.followups[0].slot != "dietary":
            warnings.append("dietary 追问未排第一，系统已置顶")
    for name in MUST_ASK:
        if len(fus) >= limit:
            break
        if not known(name) and name not in {f.slot for f in fus}:
            fus.append(DEFAULT_FOLLOWUP[name])
            warnings.append(f"必问项 {name} 缺失且模型未追问，系统已补上")
    return extraction.model_copy(update={"followups": fus[:limit]}), warnings


def cap_followups(extraction: SlotExtraction, limit: int = 3) -> tuple[SlotExtraction, list[str]]:
    """数量约束不遵守 ≠ 解析错误：超出截取并记 warning，不重试。"""
    warnings: list[str] = []
    if len(extraction.followups) > limit:
        warnings.append(f"模型给出 {len(extraction.followups)} 个追问（要求 ≤{limit}），已截取前 {limit} 个")
        extraction = extraction.model_copy(update={"followups": extraction.followups[:limit]})
    return extraction, warnings
