"""解析器宽容性：同义词归一化、单层包装解包。JSON Schema 本身仍只暴露枚举。"""
import pytest
from pydantic import ValidationError

from app.schemas.plan import ItineraryPlan, PlannedItem


def test_type_and_slot_aliases_normalized():
    it = PlannedItem(slot="Accommodation", type="transport", resource_id="VEH-TYO-001")
    assert it.slot == "accommodation" and it.type == "vehicle"
    it2 = PlannedItem(slot="AM", type="attraction", resource_id="POI-TYO-001", reason_slots="interests, children")
    assert it2.slot == "morning" and it2.type == "poi" and it2.reason_slots == ["interests", "children"]


def test_unknown_type_still_rejected():
    with pytest.raises(ValidationError):
        PlannedItem(slot="morning", type="spaceship", resource_id="X")


def test_single_wrapper_unwrapped():
    day = {"day_index": 1, "date": "2026-10-15", "city": "东京", "theme": "t", "items": []}
    plan = ItineraryPlan.model_validate({"plan": {"days": [day], "assumptions": ["a"]}})
    assert len(plan.days) == 1 and plan.assumptions == ["a"]


def test_schema_exposes_only_enum_values():
    schema = ItineraryPlan.model_json_schema()
    assert set(schema["$defs"]["PlannedItem"]["properties"]["type"]["enum"]) == {"hotel", "restaurant", "poi", "vehicle", "transfer", "free_time"}
