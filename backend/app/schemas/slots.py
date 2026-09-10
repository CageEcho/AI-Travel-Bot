"""需求卡槽位（M0 核心槽位）。

一套三用：Claude `messages.parse` 的 output_format / FastAPI response model / jsonb 校验器。
"""
from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator

Source = Literal["client_verbatim", "advisor_input", "system_inferred"]
DestinationCity = Literal["东京", "京都", "箱根"]
BudgetBasis = Literal["total", "per_person"]
FlightBudget = Literal["yes", "no", "undecided"]
HotelTier = Literal["4star", "5star", "luxury", "ryokan", "boutique"]
Dietary = Literal["no_raw", "vegetarian", "vegan", "halal", "no_pork", "no_beef", "gluten_free", "no_shellfish", "none"]
Accessibility = Literal["none", "wheelchair", "elderly_slow", "stroller"]
Pace = Literal["relaxed", "moderate", "packed"]
T = TypeVar("T")


def _validate_iso_date(v: str) -> str:
    try:
        date.fromisoformat(v)
    except ValueError as e:
        raise ValueError("日期必须是真实存在的 YYYY-MM-DD") from e
    return v


ISODate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$"), AfterValidator(_validate_iso_date)]
PositiveDays = Annotated[int, Field(ge=1, le=30)]
Adults = Annotated[int, Field(ge=1, le=30)]
Children = Annotated[int, Field(ge=0, le=20)]
ChildAge = Annotated[int, Field(ge=0, le=17)]
BudgetAmount = Annotated[int | float, Field(ge=0, le=100_000_000)]

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


class SlotValue(BaseModel, Generic[T]):
    """单个槽位值的通用外壳。SlotSet 为每个字段绑定具体 T，
    使模型输出的 JSON Schema 真正约束人数、枚举、日期和列表类型。
    """
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")

    value: T | None
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
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    destination_cities: SlotValue[list[DestinationCity]] | None = None
    date_start:         SlotValue[ISODate] | None = None
    date_end:           SlotValue[ISODate] | None = None
    duration_days:      SlotValue[PositiveDays] | None = None
    adults:             SlotValue[Adults] | None = None
    children:           SlotValue[Children] | None = None
    child_ages:         SlotValue[list[ChildAge]] | None = None
    budget_amount:      SlotValue[BudgetAmount] | None = None
    budget_basis:       SlotValue[BudgetBasis] | None = None
    budget_incl_flight: SlotValue[FlightBudget] | None = None
    hotel_tier:         SlotValue[HotelTier | list[HotelTier]] | None = None
    dietary:            SlotValue[list[Dietary]] | None = None
    accessibility:      SlotValue[Accessibility] | None = None
    interests:          SlotValue[list[str]] | None = None
    pace:               SlotValue[Pace] | None = None

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


class NextStepView(BaseModel):
    """多轮引导：AI 对当前需求的分析 + 下一步要问客户的问题。"""
    analysis: str
    followups: list[Followup]
    ready: bool
    summary: str
    source: Literal["llm", "rules"]


class MessageOut(BaseModel):
    extraction: SlotExtraction
    card: RequirementCardView
    warnings: list[str] = []
    next_step: NextStepView | None = None


class SlotPatch(BaseModel):
    slot: str
    value: str | int | float | bool | list[str] | list[int] | None
