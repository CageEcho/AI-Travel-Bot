"""业务对象的行级访问范围（会话归属沿关系传播到需求卡、任务与方案）。"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Principal
from app.models import Conversation, GenerationTask, RequirementCard


def accessible_card(db: Session, card_id: str, principal: Principal) -> RequirementCard | None:
    query = (select(RequirementCard).join(Conversation, Conversation.conv_id == RequirementCard.conv_id)
             .where(RequirementCard.card_id == card_id))
    if principal.owner_scope is not None:
        query = query.where(Conversation.owner_id == principal.owner_scope)
    return db.execute(query).scalars().first()


def accessible_task(db: Session, plan_id: str, principal: Principal) -> GenerationTask | None:
    query = (select(GenerationTask)
             .join(RequirementCard, RequirementCard.card_id == GenerationTask.card_id)
             .join(Conversation, Conversation.conv_id == RequirementCard.conv_id)
             .where(GenerationTask.plan_id == plan_id))
    if principal.owner_scope is not None:
        query = query.where(Conversation.owner_id == principal.owner_scope)
    return db.execute(query.order_by(GenerationTask.created_at.desc())).scalars().first()
