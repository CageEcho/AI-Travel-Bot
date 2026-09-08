"""3 条冲突检测（M0）：C1 预算×档次、C2 天数×城市、C3 房型×人数。作用于需求卡槽位，确定性代码。"""
from __future__ import annotations

import math
from decimal import Decimal

from app.core.config import settings
from app.schemas.facts import rooms_needed
from app.schemas.slots import Conflict, SlotSet

# 各档次的最低参考房价（JPY / 间夜），用于粗估。与种子数据 TIER_BASE 下限一致。
TIER_MIN_JPY = {"4star": 26000, "5star": 55000, "luxury": 110000, "ryokan": 68000, "boutique": 38000}
TIER_ZH = {"4star": "四星", "5star": "五星", "luxury": "奢华", "ryokan": "高端旅馆", "boutique": "精品"}


def _int(v, default=None):
    try:
        return int(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _tiers(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [v]
    return [str(x) for x in v]


def detect_conflicts(slots: SlotSet) -> list[Conflict]:
    out: list[Conflict] = []
    adults = _int(slots.get("adults"), 0) or 0
    children = _int(slots.get("children"), 0) or 0
    pax = adults + children
    days = _int(slots.get("duration_days"))
    budget = slots.get("budget_amount")
    basis = str(slots.get("budget_basis") or "total")
    tiers = _tiers(slots.get("hotel_tier"))
    cities = slots.get("destination_cities") or []
    if isinstance(cities, str):
        cities = [cities]

    # C1 预算 × 档次：按最低档次房价估住宿 + 每人每天 2.5 万日元地面开销（餐饮/门票/用车），与预算比较。
    # 估算用的是档次下限价，本身就是最低值，所以预算低于估算即冲突，不再打折。
    if isinstance(budget, (int, float)) and days and pax and tiers:
        nights = max(days - 1, 1)
        rooms = rooms_needed(adults, children)
        min_tier = min(TIER_MIN_JPY.get(t, 40000) for t in tiers)
        est_jpy = nights * rooms * min_tier + days * pax * 25000
        est_cny = Decimal(est_jpy) * settings.fx_jpy_cny
        budget_total = Decimal(str(budget)) * (pax if basis == "per_person" else 1)
        if budget_total < est_cny:
            out.append(Conflict(
                code="C1", slots=["budget_amount", "hotel_tier", "duration_days"],
                message=f"预算 {budget_total:,.0f} 元低于 {'/'.join(TIER_ZH.get(t, t) for t in tiers)} 档 "
                        f"{days} 天 {pax} 人的最低估算 {est_cny:,.0f} 元（不含机票）",
                suggestion="降低酒店档次、缩短天数，或与客户确认预算是否为每人口径"))

    # C2 天数 × 城市：每城至少 2 天
    if days and cities and len(cities) * 2 > days:
        out.append(Conflict(
            code="C2", slots=["duration_days", "destination_cities"],
            message=f"{days} 天安排 {len(cities)} 座城市（{'、'.join(cities)}），每城不足 2 天，转场占比过高",
            suggestion="减少一座城市，或延长行程"))

    # C3 房型 × 人数：>4 人单间不可行；有儿童 + 仅选 ryokan 提示年龄限制
    if rooms_needed(adults, children) > 1:
        out.append(Conflict(
            code="C3", slots=["adults", "children", "hotel_tier"],
            message=f"共 {pax} 人（{adults} 成人），单间家庭房住不下，需要 {rooms_needed(adults, children)} 间房或连通房",
            suggestion="按多间房报价，并优先带 connecting_rooms / family_room 标签的酒店"))
    elif children > 0 and tiers and set(tiers) == {"ryokan"}:
        ages = slots.get("child_ages") or []
        if isinstance(ages, (int, float, str)):
            ages = [ages]
        young = [a for a in (_int(a) for a in ages) if a is not None and a < 7]
        if young:
            out.append(Conflict(
                code="C3", slots=["hotel_tier", "child_ages"],
                message=f"随行儿童 {min(young)} 岁，多数高端旅馆限 7 岁或 12 岁以上入住",
                suggestion="增加 luxury / 5star 作为备选档次，或选择明确接待幼童的旅馆"))
    return out
