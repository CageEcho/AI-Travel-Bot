"""手动检索：接口 9。核心降级路径之一——LLM 全部不可用时仍独立可用。"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.auth import Principal, current_principal
from app.core.db import get_db
from app.core.errors import AppError
from app.schemas.search import HotelQuery, SearchResult
from app.services.retrieval import search_hotels

router = APIRouter(prefix="/search", tags=["search"])


def hotel_query(city: str, checkin: date, checkout: date, adults: int = Query(1, ge=1), children: int = Query(0, ge=0),
                child_ages: str = Query("", description="逗号分隔，如 5,9"),
                tiers: str = Query("", description="逗号分隔：4star,5star,luxury,ryokan,boutique；空=全部"),
                max_price_per_night: Decimal | None = None, require_tags: str = Query(""),
                accessible_required: bool = False) -> HotelQuery:
    try:
        return HotelQuery(city=city, checkin=checkin, checkout=checkout, adults=adults, children=children,
                          child_ages=[int(x) for x in child_ages.split(",") if x.strip()],
                          tiers=[t.strip() for t in tiers.split(",") if t.strip()] or sorted(HotelQuery.model_fields["tiers"].default_factory()),
                          max_price_per_night=max_price_per_night,
                          require_tags=[t.strip() for t in require_tags.split(",") if t.strip()],
                          accessible_required=accessible_required)
    except (ValidationError, ValueError) as e:
        raise AppError("PARAM_INVALID", f"检索参数不合法：{e}")


@router.get("/hotels", response_model=SearchResult)
def hotels(q: HotelQuery = Depends(hotel_query), db: Session = Depends(get_db),
           principal: Principal = Depends(current_principal)) -> SearchResult:
    result = search_hotels(db, q)
    if principal.can_view_cost:
        return result.model_copy(update={"cost_visible": True})
    candidates = [c.model_copy(update={"rate_id": None, "net_price": None, "season_uplift": None,
                                       "confidence": None, "rate_updated_at": None}) for c in result.candidates]
    return result.model_copy(update={"candidates": candidates, "cost_visible": False})
