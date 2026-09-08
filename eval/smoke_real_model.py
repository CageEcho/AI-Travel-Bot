"""第二层验收：真实模型端到端冒烟（阶段验收前必做）。

两种模型调用契约各跑一条真实链路，记录 模型 / 耗时 / token / 成本 / 结构合规 / 追问 / 回退轮数 / 违规数。
无 Key 时明确报告「待验」，不用 mock 结果冒充。

用法：python eval/smoke_real_model.py [--skip-plan]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import settings  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.core.db import get_sessionmaker  # noqa: E402
from app.schemas.facts import TripContext  # noqa: E402
from app.schemas.slots import SlotSet, SlotValue  # noqa: E402
from app.services.card import cap_followups, completeness, ensure_must_ask, merge_slots  # noqa: E402
from app.core.llm import active_model  # noqa: E402
from app.services.extract import extract_slots  # noqa: E402
from app.services.planner import generate_with_validation, trip_dates  # noqa: E402
from app.services.retrieval import build_pool  # noqa: E402

PRICE_IN, PRICE_OUT, PRICE_CACHE = 5.0, 25.0, 0.5   # $/MTok（Opus 5）。DeepSeek 定价不同，此处不估算（cost_usd=None）

SAMPLE = "张女士一家，两大一小，孩子 5 岁。想 10 月中旬去日本，7 天左右。住好一点的酒店，预算 15 万左右。老人肠胃不好这次不去。"


def usd(inp: int, out: int, cache: int) -> float | None:
    if settings.llm_provider != "anthropic":
        return None
    return ((inp - cache) * PRICE_IN + cache * PRICE_CACHE + out * PRICE_OUT) / 1e6


def _round(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-plan", action="store_true")
    args = ap.parse_args()
    report: dict = {"provider": settings.llm_provider, "model": active_model()}

    print("== 契约 1：槽位抽取 ==")
    try:
        ext, res = extract_slots(SAMPLE, None)
    except AppError as e:
        print(f"待验：模型调用失败 [{e.code}] {e.message}")
        return 2
    ext, warnings = cap_followups(ext)
    ext, w2 = ensure_must_ask(ext, SAMPLE, None)
    warnings += w2
    n_slots = sum(1 for n in SlotSet.slot_names() if getattr(ext.slots, n) is not None and getattr(ext.slots, n).value not in (None, "", []))
    dietary_asked = any(f.slot == "dietary" for f in ext.followups) or (ext.slots.dietary is not None and ext.slots.dietary.value not in (None, "", []))
    report["extract"] = {"latency_ms": res.latency_ms, "input_tokens": res.input_tokens, "output_tokens": res.output_tokens,
                         "cache_read_tokens": res.cache_read_tokens, "cost_usd": _round(usd(res.input_tokens, res.output_tokens, res.cache_read_tokens)),
                         "slots_extracted": n_slots, "schema_ok_first_try": not res.retried,
                         "followups": [f.slot for f in ext.followups], "dietary_followup": dietary_asked, "warnings": warnings}
    print(json.dumps(report["extract"], ensure_ascii=False, indent=1))
    print("slots:", json.dumps(json.loads(ext.slots.model_dump_json(exclude_none=True)), ensure_ascii=False))
    for f in ext.followups:
        print(f"  追问[{f.slot}] {f.question} {f.options}")

    if args.skip_plan:
        return 0
    print("\n== 契约 2：行程编排（需求卡确认后生成） ==")
    # 顾问补齐追问项（模拟人工确认）
    slots = merge_slots(SlotSet(), ext.slots)
    fill = {"destination_cities": ["东京", "箱根", "京都"], "date_start": "2026-10-15", "duration_days": 7, "adults": 2,
            "children": 1, "child_ages": [5], "budget_amount": 150000, "budget_basis": "total", "budget_incl_flight": "no",
            "hotel_tier": ["5star", "luxury"], "dietary": ["no_raw"], "accessibility": "none"}
    for k, v in fill.items():
        if getattr(slots, k) is None or k in ("hotel_tier", "dietary", "destination_cities", "date_start", "duration_days", "budget_basis", "budget_incl_flight"):
            setattr(slots, k, SlotValue(value=v, source="advisor_input", confidence=1.0))
    comp, missing = completeness(slots)
    print("completeness", comp, "missing", missing)
    ctx = TripContext.from_slots(slots)
    start, days = trip_dates(slots)
    Session = get_sessionmaker()
    with Session() as db:
        pool = build_pool(db, ["东京", "箱根", "京都"], start, start + timedelta(days=days - 1), ctx, ["5star", "luxury"])
        t0 = time.perf_counter()
        try:
            r = generate_with_validation(db, slots, pool, ctx, mode="llm")
        except AppError as e:
            print(f"待验：编排模型调用失败 [{e.code}] {e.message}")
            return 2
        total_ms = int((time.perf_counter() - t0) * 1000)
    inp = sum(c["input_tokens"] for c in r.llm_calls)
    out = sum(c["output_tokens"] for c in r.llm_calls)
    cache = sum(c["cache_read_tokens"] for c in r.llm_calls)
    report["plan"] = {"latency_ms_total": total_ms, "llm_calls": r.llm_calls, "input_tokens": inp, "output_tokens": out,
                      "cache_read_tokens": cache, "cost_usd": _round(usd(inp, out, cache)), "replan_rounds": r.rounds - 1,
                      "blocking_violations": r.blocking_count, "ref_blocked": r.ref_blocked, "unknown_items": r.unknown_count,
                      "days": len(r.rendered.days), "days_with_hotel": sum(1 for d in r.rendered.days if any(i.type == "hotel" and i.status == "ok" for i in d.items)),
                      "total_jpy": str(r.cost.total), "total_cny": str(r.cost.total_cny), "assumptions": r.rendered.assumptions}
    print(json.dumps(report["plan"], ensure_ascii=False, indent=1))
    for d in r.rendered.days:
        print(f" Day{d.day_index} {d.date} {d.city} 通勤{d.commute_min_est}min:",
              [(i.type, i.resource_id, i.status) for i in d.items])
    bad = [v for v in r.violations if v.blocking]
    if bad:
        print("BLOCKING:", [(v.code, v.resource_id, v.message) for v in bad])
    # 质量瑕疵检查：reason_note 含数字？
    digits = [i.reason_note for d in r.rendered.days for i in d.items if any(ch.isdigit() for ch in i.reason_note)]
    report["plan"]["reason_notes_with_digits"] = len(digits)
    out_path = ROOT / "eval" / "smoke_report.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("报告已写入", out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
