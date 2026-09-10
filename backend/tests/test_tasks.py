"""僵死任务的启动补偿逻辑：心跳超时的 running 任务 → failed / ORPHANED。"""
import json
from datetime import datetime, timedelta, timezone

from app.models import Conversation, GenerationTask, RequirementCard
from app.schemas.slots import SlotSet
from app.services.tasks import recover_orphans, status_of


def _card(db) -> RequirementCard:
    conv = Conversation(conv_id="CNV-task-test")
    db.merge(conv)
    card = RequirementCard(card_id="CRD-task-test", conv_id="CNV-task-test", version=1,
                           slots=json.loads(SlotSet().model_dump_json()), completeness=0, conflicts=[], followups=[],
                           confirmed_at=datetime.now(timezone.utc))
    db.merge(card)
    db.commit()
    return card


def test_orphaned_task_marked_failed(db):
    _card(db)
    old = datetime.now(timezone.utc) - timedelta(minutes=30)
    db.merge(GenerationTask(task_id="TSK-old", plan_id="PLN-old", card_id="CRD-task-test", status="planning", progress=0.4,
                            heartbeat_at=old, created_at=old))
    db.merge(GenerationTask(task_id="TSK-fresh", plan_id="PLN-fresh", card_id="CRD-task-test", status="planning", progress=0.4,
                            heartbeat_at=datetime.now(timezone.utc)))
    db.commit()
    n = recover_orphans(db, timeout_sec=300)
    assert n == 1
    st = status_of(db, "PLN-old")
    assert st.status == "failed" and st.error and st.error.code == "ORPHANED" and "重新生成" in st.error.message
    assert status_of(db, "PLN-fresh").status == "planning"   # 心跳新鲜的不受影响


def test_stalled_task_marked_failed_on_status_query(db):
    _card(db)
    stale = datetime.now(timezone.utc) - timedelta(seconds=600)
    db.merge(GenerationTask(task_id="TSK-stall", plan_id="PLN-stall", card_id="CRD-task-test", status="planning", progress=0.6,
                            replan_round=2, heartbeat_at=stale, created_at=stale))
    db.commit()
    st = status_of(db, "PLN-stall")          # 查询即判定，不等重启
    assert st.status == "failed" and st.error and st.error.code == "STALLED" and "重新生成" in st.error.message
