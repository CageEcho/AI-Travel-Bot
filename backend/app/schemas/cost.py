"""成本结构。amount 只能由 services/cost.py 计算，模型输出里不存在金额字段。"""
from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

CostCategory = Literal["accommodation", "transport", "dining", "tickets", "service_fee"]


class CostLine(BaseModel):
    category: CostCategory
    day_index: int | None = None
    resource_id: str
    rate_id: str
    qty: Decimal
    unit_price: Decimal
    season_uplift: Decimal
    amount: Decimal
    rule_trace: str          # "9800 × 2晚 × 1间 × (1+0.12) = 21952" —— 可下钻


class CostSummary(BaseModel):
    lines: list[CostLine]
    breakdown: dict[str, Decimal]
    currency: str
    total: Decimal
    per_person: Decimal
    budget_target: Decimal | None = None      # CNY
    total_cny: Decimal | None = None
    variance_pct: Decimal | None = None
    fx_rate: Decimal
    fx_time: str
    service_fee_rate: Decimal
    missing_rates: list[str] = []             # 找不到价格档的资源 → 进待核实
