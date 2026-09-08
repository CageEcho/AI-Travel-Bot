"""需求卡槽位（M0 核心槽位）。

一套三用：Claude `messages.parse` 的 output_format / FastAPI response model / jsonb 校验器。
"""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Source = Literal["client_verbatim", "advisor_input", "system_inferred"]

_CN_NUM = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def normalize_amount(v: Any) -> Any:
    """宽容解析（手册 §九.3）：「15万」「150,000」「15w」「约15万左右」→ 150000。"""
    if not isinstance(v, str):
        return v
    s = v.strip().replace(",", "").replace("，", "")
    s = re.sub(r"^(约|大概|大约|差不多)", "", s)
    s = re.sub(r"(左右|上下|以内|以下|元|人民币|日元|块)$", "", s)
    m = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*([wW万千kK]?)", s)
    if m:
        num = float(m.group(1))
        unit = m.group(2)
        mult = {"w": 10_000, "W": 10_000, "万": 10_000, "千": 1_000, "k": 1_000, "K": 1_000, "": 1}[unit]
        val = num * mult
        return int(val) if val.is_integer() else val
    return v


class SlotValue(BaseModel):
    value: str | int | float | bool | list[str] | list[int] | None
    source: Source
    confidence: float = Field(ge=0, le=1)

    @field_validator("value", mode="before")
    @classmethod
    def _loose(cls, v: Any) -> Any:
        # 「15万」这类金额写法归一化；纯数字字符串转数值
        if isinstance(v, str):
            nv = normalize_amount(v)
            if isinstance(nv, (int, float)):
                return nv
        return v


class SlotSet(BaseModel):
    """M0 核心槽位。字段名即槽位名，PATCH /card 用它校验 slot 是否存在。"""
    destination_cities: SlotValue | None = None   # list[str]，如 ["东京","京都"]
    date_start:         SlotValue | None = None   # "2026-10-15"
    date_end:           SlotValue | None = None
    duration_days:      SlotValue | None = None   # int
    adults:             SlotValue | None = None   # int
    children:           SlotValue | None = None   # int
    child_ages:         SlotValue | None = None   # list[int]
    budget_amount:      SlotValue | None = None   # 数值（CNY）
    budget_basis:       SlotValue | None = None   # total | per_person
    budget_incl_flight: SlotValue | None = None   # yes | no | undecided
    hotel_tier:         SlotValue | None = None   # 4star|5star|luxury|ryokan|boutique 或其列表
    dietary:            SlotValue | None = None   # list[str] 如 ["no_raw"]；明确无禁忌用 ["none"]
    accessibility:      SlotValue | None = None   # "none" | "wheelchair" | "elderly_slow" ...
    interests:          SlotValue | None = None   # list[str]
    pace:               SlotValue | None = None   # relaxed | moderate | packed

    @classmethod
    def slot_names(cls) -> list[str]:
        return list(cls.model_fields.keys())

    def get(self, name: str) -> Any:
        sv = getattr(self, name, None)
        return None if sv is None else sv.value


class Followup(BaseModel):
    slot: str
    question: str
    options: list[str] = []      # 能枚举就给选项，不问开放题


class SlotExtraction(BaseModel):
    slots: SlotSet
    followups: list[Followup] = Field(default_factory=list)  # 要求 ≤3；超出由服务层截取并记 warning（内容瑕疵≠解析错误）
    notes: str = ""


class Conflict(BaseModel):
    code: str            # C1 预算×档次 / C2 天数×城市 / C3 房型×人数
    slots: list[str]
    message: str
    suggestion: str


class RequirementCardView(BaseModel):
    card_id: str
    conv_id: str
    version: int
    slots: SlotSet
    completeness: float
    completeness_threshold: float
    missing_slots: list[str]
    conflicts: list[Conflict]
    followups: list[Followup]
    confirmed: bool
    confirmed_at: str | None = None


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    extraction: SlotExtraction
    card: RequirementCardView
    warnings: list[str] = []


class SlotPatch(BaseModel):
    slot: str
    value: str | int | float | bool | list[str] | list[int] | None
