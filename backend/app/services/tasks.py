"""generation_task 生命周期 + 启动补偿。

- 每进入一个阶段更新 status / progress / heartbeat_at（落库，可恢复）
- 服务启动（lifespan）时把僵死任务标 failed / ORPHANED，避免前端永久轮询
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_sessionmaker
from app.core.errors import AppError
from app.core.llm import active_model
from app.core.logging import write_trace
from app.models import GenerationTask, PlanVersion, RequirementCard
from app.schemas.common import ErrorBody, PlanStatus
from app.schemas.facts import TripContext
from app.schemas.slots import SlotSet
from app.services.planner import generate_with_validation, trip_dates
from app.services.retrieval import build_pool
from datetime import timedelta

log = logging.getLogger("app.tasks")


def recover_orphans(db: Session, timeout_sec: int | None = None) -> int:
    """把心跳超时且未完成的任务标为 failed/ORPHANED。返回处理条数。"""
    timeout_sec = timeout_sec if timeout_sec is not None else settings.generation_timeout_sec
    res = db.execute(text("""
        UPDATE generation_task
        SET status='failed', error_code='ORPHANED',
            error_message='服务重启导致任务中断，请重新生成', finished_at=now()
        WHERE status NOT IN ('done','failed')
          AND heartbeat_at < now() - make_interval(secs => :t)
    """), {"t": timeout_sec})
    db.commit()
    n = res.rowcount or 0
    if n:
        log.warning("recovered %d orphaned generation task(s)", n)
    return n


def create_task(db: Session, card_id: str) -> tuple[str, str]:
    card = db.get(RequirementCard, card_id)
    if card is None:
        raise AppError("CARD_NOT_FOUND", "需求卡不存在")
    if card.confirmed_at is None:
        raise AppError("CARD_NOT_CONFIRMED", "需求卡尚未确认，无法生成方案")   # 人工节点①（G4）
    plan_id = f"PLN-{uuid.uuid4().hex[:10]}"
    task_id = f"TSK-{uuid.uuid4().hex[:10]}"
    db.add(GenerationTask(task_id=task_id, plan_id=plan_id, card_id=card_id, status="queued", progress=0))
    db.commit()
    return plan_id, task_id


def _beat(db: Session, task: GenerationTask, status: str, progress: float, replan_round: int | None = None) -> None:
    task.status = status
    task.progress = progress
    task.heartbeat_at = datetime.now(timezone.utc)
    if replan_round is not None:
        task.replan_round = replan_round
    db.commit()


def run_generation(task_id: str, mode: str | None = None) -> None:
    """后台执行（BackgroundTasks）。用独立 session。"""
    Session = get_sessionmaker()
    with Session() as db:
        task = db.get(GenerationTask, task_id)
        if task is None:
            return
        card = db.get(RequirementCard, task.card_id)
        try:
            slots = SlotSet.model_validate(card.slots)
            ctx = TripContext.from_slots(slots)
            _beat(db, task, "searching", 0.1)
            start, days = trip_dates(slots)
            cities = slots.get("destination_cities") or ["东京"]
            if isinstance(cities, str):
                cities = [cities]
            tiers = slots.get("hotel_tier") or ["5star", "luxury", "ryokan"]
            if isinstance(tiers, str):
                tiers = [tiers]
            pool = build_pool(db, cities, start, start + timedelta(days=days - 1), ctx, tiers)
            write_trace(db, step="search", plan_id=task.plan_id, conv_id=card.conv_id,
                        payload={"funnels": pool.funnels, "hotels": len({h.hotel_id for h in pool.hotels}),
                                 "restaurants": len(pool.restaurants), "pois": len(pool.pois), "vehicles": len(pool.vehicles),
                                 "relaxation_hints": {c: [h.model_dump() for h in hs] for c, hs in pool.hotel_hints.items()}})
            if len({h.hotel_id for h in pool.hotels}) < settings.min_candidates_to_plan:
                hints = "；".join(h.suggestion for hs in pool.hotel_hints.values() for h in hs) or "请放宽档次 / 预算 / 日期"
                raise AppError("CANDIDATES_TOO_FEW", f"硬过滤后可用酒店不足 {settings.min_candidates_to_plan} 家，暂不生成。建议：{hints}")

            def on_stage(status: str, progress: float, rnd: int) -> None:
                _beat(db, task, status, progress, rnd)

            def trace(step: str, payload: dict) -> None:
                write_trace(db, step=step, plan_id=task.plan_id, conv_id=card.conv_id, payload=payload)

            result = generate_with_validation(db, slots, pool, ctx, on_stage=on_stage, mode=mode, trace=trace)
            for call in result.llm_calls:
                write_trace(db, step="plan", plan_id=task.plan_id, conv_id=card.conv_id, latency_ms=call["latency_ms"],
                            input_tokens=call["input_tokens"], output_tokens=call["output_tokens"],
                            payload={"round": call["round"], "cache_read_tokens": call["cache_read_tokens"],
                                     "retried": call["retried"], "model": active_model()})
            write_trace(db, step="cost", plan_id=task.plan_id, conv_id=card.conv_id,
                        payload={"total": str(result.cost.total), "total_cny": str(result.cost.total_cny),
                                 "missing_rates": result.cost.missing_rates})
            version = 1
            db.add(PlanVersion(plan_id=task.plan_id, version=version, card_id=card.card_id, status="draft",
                               structure=json.loads(result.rendered.model_dump_json()),
                               cost=json.loads(result.cost.model_dump_json()),
                               violations=[json.loads(v.model_dump_json()) for v in result.violations],
                               checklist=[json.loads(c.model_dump_json()) for c in result.checklist]))
            db.refresh(task)
            if task.status == "failed":          # 已被状态查询判为卡死：结果保留在 plan_version，但不再复活任务
                log.warning("task %s finished after being marked %s; leaving status", task_id, task.error_code)
                return
            task.replan_round = result.rounds - 1
            task.finished_at = datetime.now(timezone.utc)
            _beat(db, task, "done", 1.0)
            write_trace(db, step="render", plan_id=task.plan_id, conv_id=card.conv_id,
                        payload={"rounds": result.rounds, "blocking": result.blocking_count, "unknown": result.unknown_count,
                                 "ref_blocked": result.ref_blocked})
        except AppError as e:
            db.rollback()
            task = db.get(GenerationTask, task_id)
            task.status, task.error_code, task.error_message = "failed", e.code, e.message
            task.finished_at = datetime.now(timezone.utc)
            task.heartbeat_at = task.finished_at
            db.commit()
        except Exception as e:  # noqa: BLE001
            log.exception("generation failed: %s", type(e).__name__)
            db.rollback()
            task = db.get(GenerationTask, task_id)
            task.status, task.error_code, task.error_message = "failed", "INTERNAL", "生成过程发生内部错误，请重试"
            task.finished_at = datetime.now(timezone.utc)
            task.heartbeat_at = task.finished_at
            db.commit()


STALLED_MESSAGE = "模型调用长时间无响应，任务已终止，请重新生成"


def mark_stalled(db: Session, task: GenerationTask, stall_sec: int | None = None) -> bool:
    """运行中的任务心跳超时 → failed/STALLED（不等服务重启才补偿）。返回是否改了状态。"""
    if task.status in ("done", "failed"):
        return False
    limit = stall_sec if stall_sec is not None else settings.task_stall_timeout_sec
    hb = task.heartbeat_at if task.heartbeat_at.tzinfo else task.heartbeat_at.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - hb).total_seconds() <= limit:
        return False
    task.status, task.error_code, task.error_message = "failed", "STALLED", STALLED_MESSAGE
    task.finished_at = datetime.now(timezone.utc)
    db.commit()
    log.warning("task %s stalled (heartbeat %s), marked failed", task.task_id, hb.isoformat())
    return True


def status_of(db: Session, plan_id: str) -> PlanStatus:
    task = db.execute(select(GenerationTask).where(GenerationTask.plan_id == plan_id)
                      .order_by(GenerationTask.created_at.desc())).scalars().first()
    if task is None:
        raise AppError("PLAN_NOT_FOUND", "方案不存在")
    mark_stalled(db, task)
    version = None
    if task.status == "done":
        pv = db.execute(select(PlanVersion.version).where(PlanVersion.plan_id == plan_id)
                        .order_by(PlanVersion.version.desc())).scalars().first()
        version = pv
    return PlanStatus(plan_id=plan_id, task_id=task.task_id, status=task.status, progress=float(task.progress),
                      replan_round=task.replan_round, version=version,
                      error=ErrorBody(code=task.error_code, message=task.error_message or "") if task.error_code else None)
