"""轨迹回放：接口 10。漏斗数据、耗时、token。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import COST_ROLES, Principal, require_roles
from app.core.db import get_db
from app.core.errors import AppError
from app.models import RequirementCard, TraceLog
from app.services.access import accessible_task

router = APIRouter(prefix="/trace", tags=["trace"])


@router.get("/{plan_id}")
def trace(plan_id: str, db: Session = Depends(get_db),
          principal: Principal = Depends(require_roles(*COST_ROLES))) -> dict:
    task = accessible_task(db, plan_id, principal)
    if task is None:
        raise AppError("PLAN_NOT_FOUND", "方案不存在")
    rows = db.execute(select(TraceLog).where(TraceLog.plan_id == plan_id).order_by(TraceLog.trace_id)).scalars().all()
    # 会话侧的抽取轨迹一并带上
    card = db.get(RequirementCard, task.card_id)
    conv_rows = db.execute(select(TraceLog).where(TraceLog.conv_id == card.conv_id, TraceLog.plan_id.is_(None))
                           .order_by(TraceLog.trace_id)).scalars().all() if card else []
    return {"plan_id": plan_id, "task": {"status": task.status, "replan_round": task.replan_round,
                                         "error_code": task.error_code},
            "steps": [{"trace_id": r.trace_id, "step": r.step, "latency_ms": r.latency_ms, "input_tokens": r.input_tokens,
                       "output_tokens": r.output_tokens, "payload": r.payload, "created_at": r.created_at.isoformat()}
                      for r in conv_rows + rows]}
