"""约束校验器与成本引擎消费的「事实行」。

由 render.py 从 DB 回填得到；纯函数层（constraints / cost）只依赖这些结构，不碰数据库，
因此 21 个三态单测可以完全离线构造。
"""
from __future__ import annotations

import math
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.slots import SlotSet


def rooms_needed(adults: int, children: int) -> int:
    """需要的房间数（M0 粗估）：≤4 人且成人 ≤3 可住一间家庭房；否则按每间 3 人向上取整。"""
    pax = adults + children
    if pax <= 4 and adults <= 3:
        return 1
    return math.ceil(pax / 3)


class RoomFacts(BaseModel):
    hotel_id: str
    room_id: str
    city: str | None = None
    max_occupancy: int
    max_adults: int
    max_children: int
    min_child_age: int | None          # NULL = 未记录
    extra_bed: dict | None = None
    lat: float | None = None
    lng: float | None = None


class RestaurantFacts(BaseModel):
    rest_id: str
    closed_days: list[int] | None      # NULL = 未记录
    open_from: time | None = None
    open_to: time | None = None
    dietary_support: list[str] = []
    child_friendly: bool | None = None
    lat: float | None = None
    lng: float | None = None


class PoiFacts(BaseModel):
    poi_id: str
    closed_days: list[int] | None      # NULL = 未记录
    open_from: time | None = None
    open_to: time | None = None
    accessible: bool | None = None     # NULL = 未记录
    intensity: str = "moderate"
    duration_min: int = 60
    lat: float | None = None
    lng: float | None = None


class VehicleFacts(BaseModel):
    vehicle_id: str
    seats: int
    luggage_28: int | None             # NULL = 未记录


class RateFacts(BaseModel):
    rate_id: str
    resource_type: str
    resource_id: str
    valid_from: date
    valid_to: date
    blackout_dates: list[date] = []
    net_price: Decimal
    price_basis: str
    season_uplift: Decimal = Decimal("0")
    confidence: str
    updated_at: datetime


class TripContext(BaseModel):
    """从需求卡派生的行程上下文（约束与成本共用）。"""
    adults: int
    children: int = 0
    child_ages: list[int] = []
    dietary: list[str] = []            # 客户饮食限制项（"none" 视为无限制）
    accessible_required: bool = False
    budget_cny: Decimal | None = None
    budget_basis: str = "total"
    rooms: int = 1                     # 需要的房间数

    @property
    def pax(self) -> int:
        return self.adults + self.children

    @property
    def luggage_est(self) -> int:
        """等效 28 寸箱估算：成人 1 只、儿童 0.5 只，向上取整。"""
        return math.ceil(self.adults + 0.5 * self.children)

    @property
    def restrictions(self) -> list[str]:
        return [d for d in self.dietary if d and d != "none"]

    @classmethod
    def from_slots(cls, s: SlotSet) -> "TripContext":
        def as_int(v, default=0) -> int:
            try:
                return int(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        adults = max(1, as_int(s.get("adults"), 2))
        children = as_int(s.get("children"), 0)
        ages_raw = s.get("child_ages") or []
        if isinstance(ages_raw, (int, float, str)):
            ages_raw = [ages_raw]
        ages = [as_int(a) for a in ages_raw]
        dietary = s.get("dietary") or []
        if isinstance(dietary, str):
            dietary = [dietary]
        acc = s.get("accessibility")
        accessible_required = bool(acc) and str(acc).lower() not in ("none", "no", "无", "false")
        budget = s.get("budget_amount")
        basis = str(s.get("budget_basis") or "total")
        rooms = rooms_needed(adults, children)
        return cls(adults=adults, children=children, child_ages=ages, dietary=[str(d) for d in dietary],
                   accessible_required=accessible_required,
                   budget_cny=Decimal(str(budget)) if isinstance(budget, (int, float)) else None,
                   budget_basis=basis, rooms=rooms)
