"""PRD-v3 §4.3 的 12 类约束陷阱逐条断言（T1–T12）。种子数据的验收。"""
import json
from pathlib import Path

import pytest

from seed.generate import assert_traps

DATA = Path(__file__).resolve().parents[2] / "seed" / "data"


def _data():
    return {n: json.loads((DATA / f"{n}.json").read_text(encoding="utf-8"))
            for n in ("supplier", "hotel", "room_type", "rate_plan", "vehicle", "restaurant", "poi")}


CHECKS = assert_traps(_data())


@pytest.mark.parametrize("name,ok,note", CHECKS, ids=[c[0].split(" ")[0] for c in CHECKS])
def test_trap(name, ok, note):
    assert ok, f"{name}: {note}"


def test_twelve_traps_present():
    assert len(CHECKS) == 12
