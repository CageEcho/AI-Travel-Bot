"""公共结构：三态判定 Verdict、Violation、ErrorBody、PlanStatus。"""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Verdict(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    UNKNOWN = "unknown"   # ⭐ 字段缺失（未记录）—— 不等于 PASS，进待核实清单


class Violation(BaseModel):
    code: str                       # "H1" ... "H11" / "REF"（引用校验）
    verdict: Verdict
    day_index: int
    item_index: int | None = None
    resource_id: str | None = None
    message: str
    blocking: bool                  # FAIL=True；UNKNOWN=False（但进待核实清单）
    verify_hint: str | None = None  # UNKNOWN 时：要核实什么


class ChecklistItem(BaseModel):
    """待人工核实项（由 UNKNOWN 违规生成）。"""
    code: str
    day_index: int
    resource_id: str | None
    what_to_verify: str
    reason: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict | None = None


TaskStatus = Literal["queued", "searching", "planning", "validating", "costing", "done", "failed"]


class PlanStatus(BaseModel):
    plan_id: str
    task_id: str
    status: TaskStatus
    progress: float = Field(ge=0, le=1)
    replan_round: int = 0
    version: int | None = None       # done 时给出可取的版本号
    error: ErrorBody | None = None
