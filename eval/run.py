"""评测跑测脚本。

    python eval/run.py --dry-run     # 跳过 LLM：需求卡直接来自用例 slots，用确定性编排器只测规则层（不花模型钱）
    python eval/run.py               # 真实模型：抽取 + LLM 编排

输出：case_id | family | slots_f1 | blocking_violations | unknown_count | pass，以及按陷阱族汇总。
退出码：硬约束陷阱族通过率 < 100% 或 blocking 总数 > 0 时为 1。
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.db import get_sessionmaker  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.schemas.facts import TripContext  # noqa: E402
from app.schemas.slots import SlotSet, SlotValue  # noqa: E402
from app.services.card import cap_followups, ensure_must_ask, merge_slots  # noqa: E402
from app.services.conflicts import detect_conflicts  # noqa: E402
from app.services.planner import generate_with_validation, trip_dates  # noqa: E402
from app.services.retrieval import build_pool  # noqa: E402

CASES = ROOT / "eval" / "cases"


def to_slots(d: dict, source: str = "advisor_input") -> SlotSet:
    return SlotSet(**{k: SlotValue(value=v, source=source, confidence=1.0) for k, v in d.items() if v is not None})


def slots_f1(got: SlotSet, expect: dict) -> float | None:
    if not expect:
        return None
    hit = sum(1 for k, v in expect.items() if got.get(k) == v)
    return round(hit / len(expect), 2)


def run_case(db, case: dict, dry_run: bool) -> dict:
    exp = case.get("expect", {})
    out = {"id": case["id"], "family": case["family"], "slots_f1": None, "blocking": 0, "unknown": 0, "pass": True, "why": []}
    fails = out["why"]

    # ── 抽取（仅真实模式） ──
    slots = to_slots(case.get("slots") or {})
    if not dry_run:
        from app.services.extract import extract_slots
        try:
            ext, _ = extract_slots(case["input"], slots if case.get("slots") else None)
        except AppError as e:
            fails.append(f"LLM_FAILED:{e.code}")
            out["pass"] = False
            return out
        ext, _ = cap_followups(ext)
        ext, _ = ensure_must_ask(ext, case["input"], slots if case.get("slots") else None)
        f_slots = [f.slot for f in ext.followups]
        out["slots_f1"] = slots_f1(ext.slots, exp.get("slots", {}))
        for s in exp.get("must_have_followup_slots", []):
            if s not in f_slots and ext.slots.get(s) is None:
                fails.append(f"缺追问:{s}")
        if "max_followups" in exp and len(ext.followups) > exp["max_followups"]:
            fails.append("追问超限")
        if exp.get("followup_slot_must_have_options"):
            f = next((f for f in ext.followups if f.slot == exp["followup_slot_must_have_options"]), None)
            if f is not None and not f.options:
                fails.append("追问无选项")
        for s in exp.get("slots_null", []):
            if ext.slots.get(s) is not None:
                fails.append(f"应为null:{s}")
        if exp.get("inferred_slots_any") and not any(ext.slots.get(s) is not None or s in f_slots for s in exp["inferred_slots_any"]):
            fails.append("委婉表达未识别")
        merged = merge_slots(slots, ext.slots)
        for s in exp.get("locked_slots_unchanged", []):
            if merged.get(s) != slots.get(s):
                fails.append(f"顾问槽位被改写:{s}")
        if out["slots_f1"] is not None and out["slots_f1"] < 0.8:
            fails.append(f"slots_f1={out['slots_f1']}")
        slots = merged if case.get("slots") else merge_slots(to_slots({}), ext.slots)
    elif case["family"] == "slot_extraction":
        out["pass"] = None   # dry-run 下无法评估抽取 → 标记跳过，不冒充通过
        return out

    # ── 冲突检测 ──
    if "conflicts" in exp:
        codes = [c.code for c in detect_conflicts(slots)]
        for c in exp["conflicts"]:
            if c not in codes:
                fails.append(f"缺冲突:{c}")
    if not case.get("generate", True):
        out["pass"] = not fails
        return out

    # ── 生成（dry-run 用确定性编排器） ──
    ctx = TripContext.from_slots(slots)
    start, days = trip_dates(slots)
    cities = slots.get("destination_cities") or ["东京"]
    tiers = slots.get("hotel_tier") or ["5star", "luxury"]
    pool = build_pool(db, cities, start, start + timedelta(days=days - 1), ctx, tiers)
    try:
        r = generate_with_validation(db, slots, pool, ctx, mode="heuristic" if dry_run else "llm")
    except AppError as e:
        fails.append(f"生成失败:{e.code}")
        out["pass"] = False
        return out
    out["blocking"], out["unknown"] = r.blocking_count, r.unknown_count
    used = {it.resource_id for d in r.rendered.days for it in d.items if it.resource_id}
    for rid in exp.get("must_not_contain_resources", []):
        if rid in used:
            fails.append(f"陷阱资源出现:{rid}")
    if r.blocking_count > exp.get("max_blocking_violations", 0):
        detail = "; ".join(f"{v.code} D{v.day_index} {v.resource_id or '-'}: {v.message}" for v in r.violations if v.blocking)
        fails.append(f"blocking={r.blocking_count} [{detail}]")
    for code in exp.get("forbid_code_fail", []):
        if any(v.code == code and v.blocking for v in r.violations):
            fails.append(f"{code} FAIL")
    # 空值语义：凡是用到了「字段未记录 / 非合约价」的资源，必须出现在待核实清单；模型没选到陷阱资源则不算失败
    flagged = {c.resource_id for c in r.checklist}
    null_uses: list[str] = []
    null_kinds: set[str] = set()          # 用到了哪类空值：H3 休息日未记录 / H1 最低年龄未记录 / H4 行李未记录 / H11 非合约价
    for d in r.rendered.days:
        for it in d.items:
            if it.status != "ok" or not it.resource_id:
                continue
            f = it.facts or {}
            kinds = set()
            if it.type in ("restaurant", "poi") and f.get("closed_days") is None:
                kinds.add("H3")
            if it.type == "hotel" and f.get("min_child_age") is None and ctx.children > 0:
                kinds.add("H1")
            if it.type == "vehicle" and f.get("luggage_28") is None:
                kinds.add("H4")
            if it.provenance and it.provenance.price_source and it.provenance.price_source != "contracted":
                kinds.add("H11")
            if kinds:
                null_uses.append(it.resource_id)
                null_kinds |= kinds
                # 酒店的价格档 / 容量约束挂在 room_id 上，待核实清单里记的是 room_id
                if it.resource_id not in flagged and not (it.room_id and it.room_id in flagged):
                    fails.append(f"空值资源未标记:{it.resource_id}")
    if r.unknown_count < exp.get("min_unknown", 0) and (null_uses or dry_run):
        fails.append("UNKNOWN 数不足")
    want = set(exp.get("checklist_codes_any") or [])
    if want and (dry_run or (want & null_kinds)) and not any(c.code in want for c in r.checklist):
        fails.append("checklist 缺预期代码")
    if not null_uses and not dry_run and exp.get("min_unknown"):
        out["note"] = "模型未选用陷阱资源"
    if exp.get("checklist_has_verify_hint") and not all(c.what_to_verify for c in r.checklist):
        fails.append("checklist 缺核实说明")
    if exp.get("min_days") and len(r.rendered.days) < exp["min_days"]:
        fails.append("天数不足")
    if exp.get("every_day_has_hotel"):
        for d in r.rendered.days[:-1]:
            if not any(it.type == "hotel" and it.status == "ok" for it in d.items):
                fails.append(f"Day{d.day_index} 无住宿")
    for d in r.rendered.days:
        if not d.items:
            fails.append(f"Day{d.day_index} 空白")
    out["pass"] = not fails
    out["rounds"] = r.rounds - 1
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="跳过 LLM，只测规则层")
    ap.add_argument("--only", help="只跑某个 case id")
    args = ap.parse_args()
    cases = [yaml.safe_load(p.read_text(encoding="utf-8")) for p in sorted(CASES.glob("*.yaml"))]
    if args.only:
        cases = [c for c in cases if c["id"] == args.only]
    Session = get_sessionmaker()
    results = []
    with Session() as db:
        for c in cases:
            results.append(run_case(db, c, args.dry_run))
    print(f"{'case_id':<28}{'family':<22}{'slots_f1':>9}{'blocking':>9}{'unknown':>8}  pass")
    for r in results:
        p = "SKIP(LLM)" if r["pass"] is None else ("PASS" if r["pass"] else "FAIL " + "; ".join(r["why"]))
        print(f"{r['id']:<28}{r['family']:<22}{str(r['slots_f1'] if r['slots_f1'] is not None else '-'):>9}{r['blocking']:>9}{r['unknown']:>8}  {p}")
    fam: dict[str, list] = {}
    for r in results:
        fam.setdefault(r["family"], []).append(r)
    print("\n按陷阱族汇总：")
    for f, rs in fam.items():
        scored = [r for r in rs if r["pass"] is not None]
        ok = sum(1 for r in scored if r["pass"])
        rate = f"{ok}/{len(scored)} = {ok / len(scored):.0%}" if scored else "待验（需真实模型）"
        print(f"  {f:<22} {rate}")
    total_blocking = sum(r["blocking"] for r in results)
    print(f"\nblocking 违规总数：{total_blocking}")
    hard = [r for r in results if r["family"] == "hard_constraint_trap"]
    hard_ok = all(r["pass"] for r in hard)
    (ROOT / "eval" / ("report_dry_run.json" if args.dry_run else "report.json")).write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0 if hard_ok and total_blocking == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
