"""会话与需求卡：接口 1–5。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.auth import Principal, WRITE_ROLES, current_principal, require_roles
from app.core.llm import active_model
from app.core.db import get_db
from app.core.errors import AppError
from app.core.logging import digest, write_trace
from app.core.privacy import redact_pii
from app.models import Conversation, Message, RequirementCard
from app.schemas.slots import (
    NextStepView,
    Conflict, Followup, MessageIn, MessageOut, RequirementCardView, SlotExtraction, SlotPatch, SlotSet,
)
from app.services.card import cap_followups, completeness, confirmation_blockers, ensure_must_ask, merge_slots, set_slot
from app.services.conflicts import detect_conflicts
from app.services.extract import extract_slots
from app.services.guidance import build_next_step

router = APIRouter(prefix="/conversations", tags=["conversations"])


class ConversationSummary(BaseModel):
    conv_id: str
    title: str                       # 首条顾问原话前 24 字（仅顾问界面展示，不进模型）
    created_at: datetime
    last_activity_at: datetime
    completeness: float
    confirmed: bool
    plan_id: str | None = None
    plan_status: str | None = None   # queued|searching|planning|validating|costing|done|failed


class ConversationList(BaseModel):
    items: list[ConversationSummary]


LIST_SQL_TEMPLATE = """
WITH latest_card AS (
  SELECT DISTINCT ON (conv_id) conv_id, card_id, completeness, confirmed_at, created_at
  FROM requirement_card ORDER BY conv_id, version DESC),
first_msg AS (
  SELECT DISTINCT ON (conv_id) conv_id, content FROM message WHERE role = 'advisor' ORDER BY conv_id, msg_id ASC),
last_msg AS (SELECT conv_id, max(created_at) AS at FROM message GROUP BY conv_id),
latest_task AS (
  SELECT DISTINCT ON (rc.conv_id) rc.conv_id, gt.plan_id, gt.status, gt.created_at
  FROM generation_task gt JOIN requirement_card rc ON rc.card_id = gt.card_id
  ORDER BY rc.conv_id, gt.created_at DESC)
SELECT c.conv_id, c.created_at, lc.completeness, lc.confirmed_at, fm.content AS first_text, lt.plan_id, lt.status AS plan_status,
       GREATEST(c.created_at, COALESCE(lm.at, c.created_at), COALESCE(lc.created_at, c.created_at), COALESCE(lt.created_at, c.created_at)) AS last_activity_at
FROM conversation c
LEFT JOIN latest_card lc ON lc.conv_id = c.conv_id
LEFT JOIN first_msg fm ON fm.conv_id = c.conv_id
LEFT JOIN last_msg lm ON lm.conv_id = c.conv_id
LEFT JOIN latest_task lt ON lt.conv_id = c.conv_id
{owner_filter}
ORDER BY last_activity_at DESC
LIMIT :limit
"""
LIST_SQL_ALL = text(LIST_SQL_TEMPLATE.format(owner_filter=""))
LIST_SQL_OWNED = text(LIST_SQL_TEMPLATE.format(owner_filter="WHERE c.owner_id = :owner_id"))


@router.get("", response_model=ConversationList)
def list_conversations(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
                       principal: Principal = Depends(current_principal)) -> ConversationList:
    """最近会话（按最后活动时间倒序），供侧栏切换。"""
    if principal.owner_scope is None:
        rows = db.execute(LIST_SQL_ALL, {"limit": limit}).mappings().all()
    else:
        rows = db.execute(LIST_SQL_OWNED, {"limit": limit, "owner_id": principal.owner_scope}).mappings().all()
    items = []
    for r in rows:
        first = redact_pii((r["first_text"] or "").strip().replace("\n", " "))
        items.append(ConversationSummary(
            conv_id=r["conv_id"], title=(first[:24] + ("…" if len(first) > 24 else "")) if first else "未命名会话",
            created_at=r["created_at"], last_activity_at=r["last_activity_at"],
            completeness=float(r["completeness"] or 0), confirmed=r["confirmed_at"] is not None,
            plan_id=r["plan_id"], plan_status=r["plan_status"]))
    return ConversationList(items=items)


def _latest_card(db: Session, conv_id: str, principal: Principal) -> RequirementCard:
    query = (select(RequirementCard).join(Conversation, Conversation.conv_id == RequirementCard.conv_id)
             .where(RequirementCard.conv_id == conv_id))
    if principal.owner_scope is not None:
        query = query.where(Conversation.owner_id == principal.owner_scope)
    card = db.execute(query.order_by(RequirementCard.version.desc())).scalars().first()
    if card is None:
        raise AppError("CONV_NOT_FOUND", "会话不存在")
    return card


def _view(card: RequirementCard) -> RequirementCardView:
    slots = SlotSet.model_validate(card.slots)
    comp, missing = completeness(slots)
    return RequirementCardView(
        card_id=card.card_id, conv_id=card.conv_id, version=card.version, slots=slots, completeness=comp,
        completeness_threshold=settings.completeness_threshold, missing_slots=missing,
        conflicts=[Conflict.model_validate(c) for c in card.conflicts or []],
        followups=[Followup.model_validate(f) for f in card.followups or []],
        confirmed=card.confirmed_at is not None,
        confirmed_at=card.confirmed_at.isoformat() if card.confirmed_at else None)


def _save_slots(db: Session, card: RequirementCard, slots: SlotSet, followups: list[Followup]) -> RequirementCard:
    """confirm 后冻结版本：再改产生新版本；否则原地更新。"""
    comp, _ = completeness(slots)
    conflicts = [json.loads(c.model_dump_json()) for c in detect_conflicts(slots)]
    payload = dict(slots=json.loads(slots.model_dump_json()), completeness=comp, conflicts=conflicts,
                   followups=[f.model_dump() for f in followups])
    if card.confirmed_at is not None:
        new = RequirementCard(card_id=f"CRD-{uuid.uuid4().hex[:10]}", conv_id=card.conv_id, version=card.version + 1, **payload)
        db.add(new)
        db.commit()
        return new
    for k, v in payload.items():
        setattr(card, k, v)
    db.commit()
    return card


@router.post("", status_code=201)
def create_conversation(db: Session = Depends(get_db),
                        principal: Principal = Depends(require_roles(*WRITE_ROLES))) -> dict:
    conv_id = f"CNV-{uuid.uuid4().hex[:10]}"
    db.add(Conversation(conv_id=conv_id, owner_id=principal.user_id))
    db.add(RequirementCard(card_id=f"CRD-{uuid.uuid4().hex[:10]}", conv_id=conv_id, version=1,
                           slots=json.loads(SlotSet().model_dump_json()), completeness=0, conflicts=[], followups=[]))
    db.commit()
    return {"conv_id": conv_id}


@router.post("/{conv_id}/messages", response_model=MessageOut)
def post_message(conv_id: str, body: MessageIn, db: Session = Depends(get_db),
                 principal: Principal = Depends(require_roles(*WRITE_ROLES))) -> MessageOut:
    card = _latest_card(db, conv_id, principal)
    existing = SlotSet.model_validate(card.slots)
    safe_text = redact_pii(body.text)
    db.add(Message(conv_id=conv_id, role="advisor", content=safe_text))
    db.commit()
    extraction, res = extract_slots(safe_text, existing)
    extraction, warnings = cap_followups(extraction)
    extraction, w2 = ensure_must_ask(extraction, safe_text, existing)
    warnings += w2
    # 顾问填写的槽位不重问
    locked = {n for n in SlotSet.slot_names() if getattr(existing, n) is not None and getattr(existing, n).source == "advisor_input"}
    followups = [f for f in extraction.followups if f.slot not in locked]
    merged = merge_slots(existing, extraction.slots)
    card = _save_slots(db, card, merged, followups)
    # 多轮引导：用本轮抽取的追问作为候选问题（省一次模型调用），分析文字用抽取的 notes
    view = _view(card)
    step = build_next_step(merged, view.conflicts, use_llm=False, preferred=followups, analysis_hint=extraction.notes.strip())
    ai_text = (step.analysis + "\n" if step.analysis else "") + "\n".join(
        f"{f.question}" + (f"（{' / '.join(f.options)}）" if f.options else "") for f in step.followups) or "需求已记录。"
    db.add(Message(conv_id=conv_id, role="ai", content=ai_text))
    db.commit()
    write_trace(db, step="extract", conv_id=conv_id, latency_ms=res.latency_ms, input_tokens=res.input_tokens,
                output_tokens=res.output_tokens,
                payload={"digest": digest(safe_text), "pii_redacted": safe_text != body.text,
                         "cache_read_tokens": res.cache_read_tokens, "retried": res.retried,
                         "slots_extracted": sum(1 for n in SlotSet.slot_names() if getattr(extraction.slots, n) is not None),
                         "followups": [f.slot for f in followups], "warnings": warnings, "model": active_model()})
    return MessageOut(extraction=SlotExtraction(slots=extraction.slots, followups=followups, notes=extraction.notes),
                      card=_view(card), warnings=warnings, next_step=step)


@router.post("/{conv_id}/next-step", response_model=NextStepView)
def next_step(conv_id: str, db: Session = Depends(get_db),
              principal: Principal = Depends(require_roles(*WRITE_ROLES))) -> NextStepView:
    """多轮引导：顾问答完一问后调用，AI 分析当前需求卡并给出下一步要确认的问题。模型不可用时回落规则层。"""
    card = _latest_card(db, conv_id, principal)
    view = _view(card)
    step = build_next_step(view.slots, view.conflicts, use_llm=True)
    if step.followups:
        card.followups = [f.model_dump() for f in step.followups]
        db.commit()
    db.add(Message(conv_id=conv_id, role="ai", content=step.analysis + ("\n" + step.followups[0].question if step.followups else "")))
    db.commit()
    return step


@router.get("/{conv_id}/card", response_model=RequirementCardView)
def get_card(conv_id: str, db: Session = Depends(get_db),
             principal: Principal = Depends(current_principal)) -> RequirementCardView:
    return _view(_latest_card(db, conv_id, principal))


@router.patch("/{conv_id}/card", response_model=RequirementCardView)
def patch_card(conv_id: str, body: SlotPatch, db: Session = Depends(get_db),
               principal: Principal = Depends(require_roles(*WRITE_ROLES))) -> RequirementCardView:
    card = _latest_card(db, conv_id, principal)
    slots = SlotSet.model_validate(card.slots)
    try:
        slots = set_slot(slots, body.slot, body.value)
    except KeyError:
        raise AppError("SLOT_UNKNOWN", f"未知槽位：{body.slot}")
    except ValueError as e:
        raise AppError("VALUE_INVALID", f"槽位值不合法：{e}")
    followups = [Followup.model_validate(f) for f in card.followups or [] if f.get("slot") != body.slot]
    card = _save_slots(db, card, slots, followups)
    return _view(card)


@router.post("/{conv_id}/card/confirm")
def confirm_card(conv_id: str, db: Session = Depends(get_db),
                 principal: Principal = Depends(require_roles(*WRITE_ROLES))) -> dict:
    card = _latest_card(db, conv_id, principal)
    slots = SlotSet.model_validate(card.slots)
    comp, missing = completeness(slots)
    if comp < settings.completeness_threshold:
        raise AppError("COMPLETENESS_TOO_LOW",
                       f"需求卡完整度 {comp:.0%} 低于阈值 {settings.completeness_threshold:.0%}，请先补齐：{', '.join(missing)}",
                       details={"completeness": comp, "missing": missing})
    _, must_missing, conflict_codes = confirmation_blockers(slots, card.conflicts or [])
    if must_missing or conflict_codes:
        reasons = []
        if must_missing:
            reasons.append(f"必问项未确认：{', '.join(must_missing)}")
        if conflict_codes:
            reasons.append(f"存在未解决冲突：{', '.join(conflict_codes)}")
        raise AppError("CARD_NOT_READY", "；".join(reasons),
                       details={"must_ask_missing": must_missing, "conflicts": conflict_codes})
    if card.confirmed_at is None:
        card.confirmed_at = datetime.now(timezone.utc)
        db.commit()
    return {"card_id": card.card_id, "version": card.version, "confirmed_at": card.confirmed_at.isoformat()}
