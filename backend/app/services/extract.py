"""槽位抽取：客户原话 + 已有需求卡 → SlotExtraction（结构化输出）。"""
from __future__ import annotations

from app.core.llm import LLMResult, load_prompt, parse_structured
from app.schemas.slots import SlotExtraction, SlotSet


def extract_slots(text: str, existing: SlotSet | None) -> tuple[SlotExtraction, LLMResult]:
    system = load_prompt("extract_slots.md")   # 稳定前缀，挂缓存
    existing_json = existing.model_dump_json(exclude_none=True) if existing else "{}"
    user = (f"<existing_slots>\n{existing_json}\n</existing_slots>\n\n"
            f"<client_message>\n{text}\n</client_message>")
    res = parse_structured(system=system, user=user, output_format=SlotExtraction, max_tokens=8000)
    assert isinstance(res.parsed, SlotExtraction)
    return res.parsed, res
