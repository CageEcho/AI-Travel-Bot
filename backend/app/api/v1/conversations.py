"""会话与需求卡：接口 1–5。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.llm import active_model
from app.core.db import get_db
from app.core.errors import AppError
from app.core.logging import digest, write_trace
from app.models import Conversation, Message, RequirementCard
from app.schemas.slots import (
    Conflict, Followup, MessageIn, MessageOut, RequirementCardView, SlotExtraction, SlotPatch, SlotSet,
)
from app.services.card import cap_followups, completeness, ensure_must_ask, merge_slots, set_slot
from app.services.conflicts import detect_conflicts
from app.services.extract import extract_slots

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _latest_card(db: Session, conv_id: str) -> RequirementCard:
    card = db.execute(select(RequirementCard).where(RequirementCard.conv_id == conv_id)
                      .order_by(RequirementCard.version.desc())).scalars().first()
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
def create_conversation(db: Session = Depends(get_db)) -> dict:
    conv_id = f"CNV-{uuid.uuid4().hex[:10]}"
    db.add(Conversation(conv_id=conv_id))
    db.add(RequirementCard(card_id=f"CRD-{uuid.uuid4().hex[:10]}", conv_id=conv_id, version=1,
                           slots=json.loads(SlotSet().model_dump_json()), completeness=0, conflicts=[], followups=[]))
    db.commit()
    return {"conv_id": conv_id}


@router.post("/{conv_id}/messages", response_model=MessageOut)
def post_message(conv_id: str, body: MessageIn, db: Session = Depends(get_db)) -> MessageOut:
    card = _latest_card(db, conv_id)
    existing = SlotSet.model_validate(card.slots)
    db.add(Message(conv_id=conv_id, role="advisor", content=body.text))
    db.commit()
    extraction, res = extract_slots(body.text, existing)
    extraction, warnings = cap_followups(extraction)
    extraction, w2 = ensure_must_ask(extraction, body.text, existing)
    warnings += w2
    # 顾问填写的槽位不重问
    locked = {n for n in SlotSet.slot_names() if getattr(existing, n) is not None and getattr(existing, n).source == "advisor_input"}
    followups = [f for f in extraction.followups if f.slot not in locked]
    merged = merge_slots(existing, extraction.slots)
    card = _save_slots(db, card, merged, followups)
    ai_text = "\n".join(f"{f.question}" + (f"（{' / '.join(f.options)}）" if f.options else "") for f in followups) or "需求已记录。"
    db.add(Message(conv_id=conv_id, role="ai", content=ai_text))
    db.commit()
    write_trace(db, step="extract", conv_id=conv_id, latency_ms=res.latency_ms, input_tokens=res.input_tokens,
                output_tokens=res.output_tokens,
                payload={"digest": digest(body.text), "cache_read_tokens": res.cache_read_tokens, "retried": res.retried,
                         "slots_extracted": sum(1 for n in SlotSet.slot_names() if getattr(extraction.slots, n) is not None),
                         "followups": [f.slot for f in followups], "warnings": warnings, "model": active_model()})
    return MessageOut(extraction=SlotExtraction(slots=extraction.slots, followups=followups, notes=extraction.notes),
                      card=_view(card), warnings=warnings)


@router.get("/{conv_id}/card", response_model=RequirementCardView)
def get_card(conv_id: str, db: Session = Depends(get_db)) -> RequirementCardView:
    return _view(_latest_card(db, conv_id))


@router.patch("/{conv_id}/card", response_model=RequirementCardView)
def patch_card(conv_id: str, body: SlotPatch, db: Session = Depends(get_db)) -> RequirementCardView:
    card = _latest_card(db, conv_id)
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
def confirm_card(conv_id: str, db: Session = Depends(get_db)) -> dict:
    card = _latest_card(db, conv_id)
    slots = SlotSet.model_validate(card.slots)
    comp, missing = completeness(slots)
    if comp < settings.completeness_threshold:
        raise AppError("COMPLETENESS_TOO_LOW",
                       f"需求卡完整度 {comp:.0%} 低于阈值 {settings.completeness_threshold:.0%}，请先补齐：{', '.join(missing)}",
                       details={"completeness": comp, "missing": missing})
    if card.confirmed_at is None:
        card.confirmed_at = datetime.now(timezone.utc)
        db.commit()
    return {"card_id": card.card_id, "version": card.version, "confirmed_at": card.confirmed_at.isoformat()}
