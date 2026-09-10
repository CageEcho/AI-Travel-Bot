"""方案：接口 6–8。提交 + 轮询（不用 SSE）。"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.auth import Principal, WRITE_ROLES, current_principal, require_roles
from app.core.db import get_db
from app.core.errors import AppError
from app.models import PlanVersion
from app.schemas.common import ChecklistItem, PlanStatus, Violation
from app.schemas.cost import CostSummary
from app.schemas.plan import PlanCreate, PlanVersionView, RenderedPlan
from app.services.access import accessible_card, accessible_task
from app.services.tasks import create_task, run_generation, status_of

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", status_code=202)
def create_plan(body: PlanCreate, bg: BackgroundTasks, db: Session = Depends(get_db),
                principal: Principal = Depends(require_roles(*WRITE_ROLES))) -> JSONResponse:
    if accessible_card(db, body.card_id, principal) is None:
        raise AppError("CARD_NOT_FOUND", "需求卡不存在")
    plan_id, task_id = create_task(db, body.card_id)     # 未 confirm → 409 CARD_NOT_CONFIRMED
    bg.add_task(run_generation, task_id)
    return JSONResponse(status_code=202, content={"plan_id": plan_id, "task_id": task_id})


@router.get("/{plan_id}/status", response_model=PlanStatus)
def plan_status(plan_id: str, db: Session = Depends(get_db),
                principal: Principal = Depends(current_principal)) -> PlanStatus:
    if accessible_task(db, plan_id, principal) is None:
        raise AppError("PLAN_NOT_FOUND", "方案不存在")
    return status_of(db, plan_id)


@router.get("/{plan_id}/versions/{version}", response_model=PlanVersionView)
def plan_version(plan_id: str, version: int, db: Session = Depends(get_db),
                 principal: Principal = Depends(current_principal)) -> PlanVersionView:
    task = accessible_task(db, plan_id, principal)
    if task is None:
        raise AppError("PLAN_NOT_FOUND", "方案不存在")
    pv = db.get(PlanVersion, (plan_id, version))
    if pv is None:
        raise AppError("VERSION_NOT_FOUND", f"方案版本 {version} 不存在（可能仍在生成中）")
    violations = [Violation.model_validate(v) for v in pv.violations]
    structure = RenderedPlan.model_validate(pv.structure)
    if not principal.can_view_cost:
        structure = _hide_pricing_provenance(structure)
    return PlanVersionView(plan_id=pv.plan_id, version=pv.version, card_id=pv.card_id, status=pv.status,
                           structure=structure, cost=CostSummary.model_validate(pv.cost) if principal.can_view_cost else None,
                           cost_visible=principal.can_view_cost,
                           violations=violations, checklist=[ChecklistItem.model_validate(c) for c in pv.checklist],
                           blocking_count=sum(1 for v in violations if v.blocking),
                           unknown_count=sum(1 for v in violations if not v.blocking),
                           replan_rounds=task.replan_round if task else 0, created_at=pv.created_at.isoformat())


def _hide_pricing_provenance(plan: RenderedPlan) -> RenderedPlan:
    """无净价权限时在后端删除价格档及价格来源，避免靠前端隐藏。"""
    plan = plan.model_copy(deep=True)
    for day in plan.days:
        for item in day.items:
            if item.provenance:
                item.provenance.rate_id = None
                item.provenance.price_source = None
    return plan
