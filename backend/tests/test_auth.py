"""身份认证、角色门禁与敏感价格字段的后端过滤。"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.api.v1.plans import _hide_pricing_provenance
from app.core.config import settings
from app.models import Conversation, GenerationTask, PlanVersion, RequirementCard
from app.schemas.cost import CostSummary
from app.schemas.plan import RenderedPlan
from app.schemas.slots import SlotSet


KEYS = {
    "sales-key-1234567890": {"user_id": "sales-01", "role": "sales"},
    "advisor-key-12345678": {"user_id": "advisor-01", "role": "advisor"},
    "buyer-key-1234567890": {"user_id": "buyer-01", "role": "procurement"},
    "supervisor-key-12345": {"user_id": "supervisor-01", "role": "supervisor"},
}


def _enable(monkeypatch):
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "api_keys_json", json.dumps(KEYS))


def _h(key: str) -> dict[str, str]:
    return {"X-API-Key": key}


def test_auth_fails_closed_and_never_echoes_key(client, monkeypatch):
    _enable(monkeypatch)
    missing = client.get("/api/v1/meta/me")
    assert missing.status_code == 401 and missing.json()["error"]["code"] == "AUTH_REQUIRED"
    invalid = client.get("/api/v1/meta/me", headers=_h("wrong-key-123456789"))
    assert invalid.status_code == 401 and invalid.json()["error"]["code"] == "AUTH_INVALID"
    assert "wrong-key" not in invalid.text


def test_valid_identity_and_role_are_returned_without_secret(client, monkeypatch):
    _enable(monkeypatch)
    response = client.get("/api/v1/meta/me", headers=_h("advisor-key-12345678"))
    assert response.status_code == 200
    assert response.json() == {"user_id": "advisor-01", "role": "advisor", "cost_visible": True}
    assert "advisor-key" not in response.text


def test_procurement_is_read_only_and_sales_cannot_open_trace(client, monkeypatch):
    _enable(monkeypatch)
    denied_write = client.post("/api/v1/conversations", headers=_h("buyer-key-1234567890"))
    assert denied_write.status_code == 403 and denied_write.json()["error"]["code"] == "FORBIDDEN"
    denied_trace = client.get("/api/v1/trace/PLN-any", headers=_h("sales-key-1234567890"))
    assert denied_trace.status_code == 403 and denied_trace.json()["error"]["code"] == "FORBIDDEN"


def test_enabled_with_bad_config_fails_closed(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "api_keys_json", "not-json")
    response = client.get("/api/v1/meta/me", headers=_h("some-valid-looking-key"))
    assert response.status_code == 503 and response.json()["error"]["code"] == "AUTH_CONFIG_INVALID"


def test_sales_plan_filter_removes_pricing_provenance():
    plan = RenderedPlan.model_validate({"days": [{
        "day_index": 1, "date": "2026-10-15", "weekday": 4, "city": "东京", "theme": "抵达", "items": [{
            "slot": "accommodation", "type": "hotel", "resource_id": "HTL-1", "room_id": "ROOM-1",
            "name_zh": "测试酒店", "provenance": {
                "resource_id": "HTL-1", "resource_type": "hotel", "price_source": "contracted", "rate_id": "RATE-SECRET"
            }
        }]
    }]})
    filtered = _hide_pricing_provenance(plan)
    provenance = filtered.days[0].items[0].provenance
    assert provenance and provenance.rate_id is None and provenance.price_source is None
    original = plan.days[0].items[0].provenance
    assert original and original.rate_id == "RATE-SECRET"  # 深拷贝，不能污染授权角色的响应


def test_sales_search_response_filters_cost_fields(client, monkeypatch):
    _enable(monkeypatch)
    params = {"city": "京都", "checkin": "2026-10-15", "checkout": "2026-10-18", "adults": 2,
              "children": 1, "child_ages": "5", "tiers": "5star,luxury"}
    sales = client.get("/api/v1/search/hotels", params=params, headers=_h("sales-key-1234567890"))
    assert sales.status_code == 200 and sales.json()["cost_visible"] is False
    assert sales.json()["candidates"]
    assert all(c["net_price"] is None and c["rate_id"] is None and c["season_uplift"] is None
               and c["confidence"] is None and c["rate_updated_at"] is None for c in sales.json()["candidates"])

    advisor = client.get("/api/v1/search/hotels", params=params, headers=_h("advisor-key-12345678"))
    assert advisor.status_code == 200 and advisor.json()["cost_visible"] is True
    assert all(c["net_price"] is not None and c["rate_id"] is not None for c in advisor.json()["candidates"])


def test_plan_version_cost_is_filtered_by_role_at_api_boundary(client, db, monkeypatch):
    _enable(monkeypatch)
    plan = RenderedPlan.model_validate({"days": [{
        "day_index": 1, "date": "2026-10-15", "weekday": 4, "city": "东京", "theme": "抵达", "items": [{
            "slot": "accommodation", "type": "hotel", "resource_id": "HTL-1", "room_id": "ROOM-1",
            "provenance": {"resource_id": "HTL-1", "resource_type": "hotel", "price_source": "contracted", "rate_id": "RATE-SECRET"}
        }]
    }]})
    cost = CostSummary(lines=[], breakdown={}, currency="JPY", total=1000, per_person=500,
                       total_cny=48, fx_rate="0.0479", fx_time="2026-10-15T00:00:00Z",
                       service_fee_rate="0.08")
    now = datetime.now(timezone.utc)
    db.add(Conversation(conv_id="CNV-auth-plan", owner_id="sales-01"))
    db.commit()
    db.add(RequirementCard(card_id="CRD-auth-plan", conv_id="CNV-auth-plan", version=1,
                           slots=json.loads(SlotSet().model_dump_json()), completeness=1,
                           conflicts=[], followups=[], confirmed_at=now))
    db.commit()
    db.add(GenerationTask(task_id="TSK-auth-plan", plan_id="PLN-auth-plan", card_id="CRD-auth-plan",
                          status="done", progress=1, finished_at=now))
    db.add(PlanVersion(plan_id="PLN-auth-plan", version=1, card_id="CRD-auth-plan", status="draft",
                       structure=json.loads(plan.model_dump_json()), cost=json.loads(cost.model_dump_json()),
                       violations=[], checklist=[]))
    db.commit()

    path = "/api/v1/plans/PLN-auth-plan/versions/1"
    sales = client.get(path, headers=_h("sales-key-1234567890"))
    assert sales.status_code == 200 and sales.json()["cost_visible"] is False and sales.json()["cost"] is None
    sales_prov = sales.json()["structure"]["days"][0]["items"][0]["provenance"]
    assert sales_prov["rate_id"] is None and sales_prov["price_source"] is None

    other_advisor = client.get(path, headers=_h("advisor-key-12345678"))
    assert other_advisor.status_code == 404 and other_advisor.json()["error"]["code"] == "PLAN_NOT_FOUND"

    supervisor = client.get(path, headers=_h("supervisor-key-12345"))
    assert supervisor.status_code == 200 and supervisor.json()["cost_visible"] is True
    assert supervisor.json()["cost"]["total"] == "1000"
    assert supervisor.json()["structure"]["days"][0]["items"][0]["provenance"]["rate_id"] == "RATE-SECRET"


def test_conversation_owner_scope_applies_to_list_and_detail(client, monkeypatch):
    _enable(monkeypatch)
    sales_id = client.post("/api/v1/conversations", headers=_h("sales-key-1234567890")).json()["conv_id"]
    advisor_id = client.post("/api/v1/conversations", headers=_h("advisor-key-12345678")).json()["conv_id"]

    sales_items = client.get("/api/v1/conversations", headers=_h("sales-key-1234567890")).json()["items"]
    assert sales_id in {item["conv_id"] for item in sales_items}
    assert advisor_id not in {item["conv_id"] for item in sales_items}
    assert client.get(f"/api/v1/conversations/{advisor_id}/card", headers=_h("sales-key-1234567890")).status_code == 404

    supervisor_items = client.get("/api/v1/conversations", headers=_h("supervisor-key-12345")).json()["items"]
    ids = {item["conv_id"] for item in supervisor_items}
    assert sales_id in ids and advisor_id in ids
    assert client.get(f"/api/v1/conversations/{advisor_id}/card", headers=_h("supervisor-key-12345")).status_code == 200
