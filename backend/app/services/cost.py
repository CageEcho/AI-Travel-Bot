"""成本规则引擎——纯确定性代码，不经过模型（PRD-v2 决策 D6）。

| 类别 | 公式 |
| 住宿 | net_price × nights × rooms × (1 + season_uplift) |
| 交通（包车） | net_price × days |
| 餐饮 | net_price × adults + net_price × 0.5 × children |
| 门票 | net_price × pax |
| 服务费 | sum(above) × service_fee_rate |

铁律：amount 只能由本模块计算。任何从 LLM 响应里读金额的代码都是 bug。
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from app.core.config import settings
from app.schemas.cost import CostLine, CostSummary
from app.schemas.facts import RateFacts, TripContext
from app.schemas.plan import RenderedPlan

Q = Decimal("0.01")


def money(x: Decimal) -> Decimal:
    return x.quantize(Q, rounding=ROUND_HALF_UP)


def line_accommodation(rate: RateFacts, nights: int, rooms: int, day_index: int | None = None) -> CostLine:
    factor = Decimal(1) + rate.season_uplift
    amount = money(rate.net_price * nights * rooms * factor)
    return CostLine(category="accommodation", day_index=day_index, resource_id=rate.resource_id, rate_id=rate.rate_id,
                    qty=Decimal(nights * rooms), unit_price=rate.net_price, season_uplift=rate.season_uplift, amount=amount,
                    rule_trace=f"{rate.net_price:f} × {nights}晚 × {rooms}间 × (1+{rate.season_uplift:f}) = {amount:f}")


def line_transport(rate: RateFacts, days: int, day_index: int | None = None) -> CostLine:
    amount = money(rate.net_price * days)
    return CostLine(category="transport", day_index=day_index, resource_id=rate.resource_id, rate_id=rate.rate_id,
                    qty=Decimal(days), unit_price=rate.net_price, season_uplift=Decimal(0), amount=amount,
                    rule_trace=f"{rate.net_price:f} × {days}天 = {amount:f}")


def line_dining(rate: RateFacts, adults: int, children: int, day_index: int | None = None) -> CostLine:
    amount = money(rate.net_price * adults + rate.net_price * Decimal("0.5") * children)
    return CostLine(category="dining", day_index=day_index, resource_id=rate.resource_id, rate_id=rate.rate_id,
                    qty=Decimal(adults) + Decimal("0.5") * children, unit_price=rate.net_price, season_uplift=Decimal(0),
                    amount=amount, rule_trace=f"{rate.net_price:f} × {adults}成人 + {rate.net_price:f} × 0.5 × {children}儿童 = {amount:f}")


def line_tickets(rate: RateFacts, pax: int, day_index: int | None = None) -> CostLine:
    amount = money(rate.net_price * pax)
    trace = "免费入场" if rate.net_price == 0 else f"{rate.net_price:f} × {pax}人 = {amount:f}"
    return CostLine(category="tickets", day_index=day_index, resource_id=rate.resource_id, rate_id=rate.rate_id,
                    qty=Decimal(pax), unit_price=rate.net_price, season_uplift=Decimal(0), amount=amount, rule_trace=trace)


def summarize(lines: list[CostLine], ctx: TripContext, missing_rates: list[str] | None = None,
              currency: str = "JPY") -> CostSummary:
    subtotal = sum((l.amount for l in lines), Decimal(0))
    fee = money(subtotal * settings.service_fee_rate)
    fee_line = CostLine(category="service_fee", resource_id="-", rate_id="-", qty=Decimal(1), unit_price=subtotal,
                        season_uplift=Decimal(0), amount=fee,
                        rule_trace=f"{subtotal:f} × {settings.service_fee_rate:f} = {fee:f}")
    all_lines = lines + [fee_line]
    breakdown: dict[str, Decimal] = {k: Decimal(0) for k in ("accommodation", "transport", "dining", "tickets", "service_fee")}
    for l in all_lines:
        breakdown[l.category] += l.amount
    total = money(subtotal + fee)
    per_person = money(total / ctx.pax) if ctx.pax else total
    total_cny = money(total * settings.fx_jpy_cny)
    budget_target = None
    variance = None
    if ctx.budget_cny is not None:
        budget_target = ctx.budget_cny * (ctx.pax if ctx.budget_basis == "per_person" else 1)
        if budget_target > 0:
            variance = money((total_cny - budget_target) / budget_target * 100)
    return CostSummary(lines=all_lines, breakdown=breakdown, currency=currency, total=total, per_person=per_person,
                       budget_target=budget_target, total_cny=total_cny, variance_pct=variance,
                       fx_rate=settings.fx_jpy_cny, fx_time=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                       service_fee_rate=settings.service_fee_rate, missing_rates=missing_rates or [])


def calc_cost(plan: RenderedPlan, ctx: TripContext, rates: dict[str, RateFacts]) -> CostSummary:
    """rates: resource_id → 该资源在占用日期上选定的价格档（由 render 阶段查出）。找不到的进 missing_rates。"""
    lines: list[CostLine] = []
    missing: list[str] = []
    vehicle_days: dict[str, int] = {}
    # 住宿条目每天都出现，但 nights 只在入住日声明连住晚数。
    # 记录同一房型已覆盖到哪一天，避免后续展示条目重复计费。
    hotel_covered_through: dict[str, int] = {}
    for day in plan.days:
        for item in day.items:
            if item.status != "ok" or item.type in ("free_time", "transfer") or not item.resource_id:
                continue
            key = item.room_id if item.type == "hotel" and item.room_id else item.resource_id
            rate = rates.get(key)
            if item.type == "vehicle":
                vehicle_days[item.resource_id] = vehicle_days.get(item.resource_id, 0) + 1
                continue
            if rate is None:
                missing.append(key)
                continue
            if item.type == "hotel":
                if day.day_index <= hotel_covered_through.get(key, 0):
                    continue
                nights = item.nights or 1
                lines.append(line_accommodation(rate, nights, ctx.rooms, day.day_index))
                hotel_covered_through[key] = day.day_index + nights - 1
            elif item.type == "restaurant":
                lines.append(line_dining(rate, ctx.adults, ctx.children, day.day_index))
            elif item.type == "poi":
                lines.append(line_tickets(rate, ctx.pax, day.day_index))
    for vid, days in vehicle_days.items():
        rate = rates.get(vid)
        if rate is None:
            missing.append(vid)
            continue
        lines.append(line_transport(rate, days))
    return summarize(lines, ctx, missing)
