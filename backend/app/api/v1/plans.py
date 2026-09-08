"""方案：接口 6–8。提交 + 轮询（不用 SSE）。"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.models import GenerationTask, PlanVersion
from app.schemas.common import ChecklistItem, PlanStatus, Violation
from app.schemas.cost import CostSummary
from app.schemas.plan import PlanCreate, PlanVersionView, RenderedPlan
from app.services.tasks import create_task, run_generation, status_of

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", status_code=202)
def create_plan(body: PlanCreate, bg: BackgroundTasks, db: Session = Depends(get_db)) -> JSONResponse:
    plan_id, task_id = create_task(db, body.card_id)     # 未 confirm → 409 CARD_NOT_CONFIRMED
    bg.add_task(run_generation, task_id)
    return JSONResponse(status_code=202, content={"plan_id": plan_id, "task_id": task_id})


@router.get("/{plan_id}/status", response_model=PlanStatus)
def plan_status(plan_id: str, db: Session = Depends(get_db)) -> PlanStatus:
    return status_of(db, plan_id)


@router.get("/{plan_id}/versions/{version}", response_model=PlanVersionView)
def plan_version(plan_id: str, version: int, db: Session = Depends(get_db)) -> PlanVersionView:
    exists = db.execute(select(GenerationTask.task_id).where(GenerationTask.plan_id == plan_id)).first()
    if exists is None:
        raise AppError("PLAN_NOT_FOUND", "方案不存在")
    pv = db.get(PlanVersion, (plan_id, version))
    if pv is None:
        raise AppError("VERSION_NOT_FOUND", f"方案版本 {version} 不存在（可能仍在生成中）")
    task = db.execute(select(GenerationTask).where(GenerationTask.plan_id == plan_id)
                      .order_by(GenerationTask.created_at.desc())).scalars().first()
    violations = [Violation.model_validate(v) for v in pv.violations]
    return PlanVersionView(plan_id=pv.plan_id, version=pv.version, card_id=pv.card_id, status=pv.status,
                           structure=RenderedPlan.model_validate(pv.structure), cost=CostSummary.model_validate(pv.cost),
                           violations=violations, checklist=[ChecklistItem.model_validate(c) for c in pv.checklist],
                           blocking_count=sum(1 for v in violations if v.blocking),
                           unknown_count=sum(1 for v in violations if not v.blocking),
                           replan_rounds=task.replan_round if task else 0, created_at=pv.created_at.isoformat())
