"""槽位取值规范：枚举表、中文同义词归一化、写入校验。

顾问点选项 / 手填的值经这里归一化再入库，避免「两人总计」这类原文被写进枚举字段。
确定性代码，不经过模型。
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.schemas.slots import normalize_amount

ENUM_SLOTS: dict[str, list[str]] = {
    "destination_cities": ["东京", "京都", "箱根"],
    "budget_basis": ["total", "per_person"],
    "budget_incl_flight": ["yes", "no", "undecided"],
    "hotel_tier": ["4star", "5star", "luxury", "ryokan", "boutique"],
    "dietary": ["none", "no_raw", "vegetarian", "vegan", "halal", "no_pork", "no_beef", "gluten_free", "no_shellfish"],
    "accessibility": ["none", "wheelchair", "elderly_slow", "stroller"],
    "pace": ["relaxed", "moderate", "packed"],
}
LIST_SLOTS = {"destination_cities", "hotel_tier", "dietary", "interests", "child_ages"}
INT_SLOTS = {"duration_days", "adults", "children", "budget_amount"}
DATE_SLOTS = {"date_start", "date_end"}

LABEL_ZH: dict[str, str] = {
    "total": "总预算", "per_person": "每人", "yes": "含机票", "no": "不含机票", "undecided": "还没定",
    "4star": "四星", "5star": "五星", "luxury": "奢华", "ryokan": "高端旅馆", "boutique": "精品",
    "none": "无", "no_raw": "忌生食", "vegetarian": "素食", "vegan": "纯素", "halal": "清真", "no_pork": "不吃猪肉",
    "no_beef": "不吃牛肉", "gluten_free": "无麸质", "no_shellfish": "忌贝类海鲜",
    "wheelchair": "轮椅", "elderly_slow": "老人慢行", "stroller": "婴儿车",
    "relaxed": "放松", "moderate": "适中", "packed": "紧凑",
}

# 同义词 → 规范值（按槽位）。匹配时去掉括号说明、空格与标点。
SYNONYMS: dict[str, dict[str, str]] = {
    "destination_cities": {"东京": "东京", "tokyo": "东京", "京都": "京都", "kyoto": "京都", "箱根": "箱根", "hakone": "箱根"},
    "budget_basis": {"total": "total", "总预算": "total", "总计": "total", "总额": "total", "全家": "total", "全家总价": "total", "两人总计": "total",
                     "一家": "total", "整体": "total", "总共": "total", "per_person": "per_person", "每人": "per_person", "人均": "per_person", "按人": "per_person"},
    "budget_incl_flight": {"yes": "yes", "含机票": "yes", "包含机票": "yes", "含": "yes", "包含": "yes", "是": "yes",
                           "no": "no", "不含机票": "no", "不含": "no", "不包含": "no", "不包含机票": "no", "否": "no",
                           "undecided": "undecided", "未定": "undecided", "还没定": "undecided", "不确定": "undecided", "待定": "undecided"},
    "hotel_tier": {"4star": "4star", "四星": "4star", "4星": "4star", "5star": "5star", "五星": "5star", "5星": "5star", "luxury": "luxury", "奢华": "luxury",
                   "顶奢": "luxury", "ryokan": "ryokan", "高端旅馆": "ryokan", "温泉旅馆": "ryokan", "高端温泉旅馆": "ryokan", "旅馆": "ryokan",
                   "boutique": "boutique", "精品": "boutique", "精品酒店": "boutique"},
    "dietary": {"none": "none", "无": "none", "没有": "none", "无禁忌": "none", "不忌口": "none", "都行": "none", "没什么忌口": "none",
                "no_raw": "no_raw", "忌生食": "no_raw", "不吃生食": "no_raw", "不吃生": "no_raw", "生冷少": "no_raw", "少生冷": "no_raw",
                "vegetarian": "vegetarian", "素食": "vegetarian", "吃素": "vegetarian", "vegan": "vegan", "纯素": "vegan",
                "halal": "halal", "清真": "halal", "no_pork": "no_pork", "不吃猪肉": "no_pork", "no_beef": "no_beef", "不吃牛肉": "no_beef",
                "gluten_free": "gluten_free", "无麸质": "gluten_free", "no_shellfish": "no_shellfish", "忌贝类": "no_shellfish", "不吃海鲜": "no_shellfish",
                "忌贝类海鲜": "no_shellfish", "海鲜过敏": "no_shellfish"},
    "accessibility": {"none": "none", "无": "none", "没有": "none", "不需要": "none", "wheelchair": "wheelchair", "轮椅": "wheelchair",
                      "elderly_slow": "elderly_slow", "老人慢行": "elderly_slow", "慢行": "elderly_slow", "腿脚不好": "elderly_slow",
                      "stroller": "stroller", "婴儿车": "stroller", "推车": "stroller"},
    "pace": {"relaxed": "relaxed", "放松": "relaxed", "慢": "relaxed", "moderate": "moderate", "适中": "moderate", "正常": "moderate",
             "packed": "packed", "紧凑": "packed", "满": "packed"},
}


def _clean(s: str) -> str:
    s = re.sub(r"[（(].*?[)）]", "", s)          # 去括号说明
    return re.sub(r"[\s，,。.、/]+", "", s).strip().lower()


def normalize_date(raw: str, default_year: int | None = None) -> str:
    """接受 2026-10-15 / 2026/10/15 / 2026.10.15 / 2026年10月15日 / 10月15日 / 10-15；缺年份按当年（10 月中旬这类模糊表达不接受）。"""
    s = raw.strip()
    m = re.fullmatch(r"(?:(\d{4})[-/.年])?\s*(\d{1,2})[-/.月]\s*(\d{1,2})\s*日?", s)
    if not m:
        raise ValueError("日期需要写成 2026-10-15 或 10月15日 这样的具体日期")
    year = int(m.group(1)) if m.group(1) else (default_year or date.today().year)
    try:
        return date(year, int(m.group(2)), int(m.group(3))).isoformat()
    except ValueError:
        raise ValueError(f"日期不存在：{raw}")


def label_of(value: Any) -> str:
    return LABEL_ZH.get(str(value), str(value))


def options_for(slot: str) -> list[str]:
    """给前端 / 模型的可选项（中文标签）。"""
    return [label_of(v) for v in ENUM_SLOTS.get(slot, [])]


def _norm_enum(slot: str, raw: Any) -> str:
    s = _clean(str(raw))
    table = SYNONYMS[slot]
    if s in table:
        return table[s]
    # 允许直接给中文标签或规范值
    for canon in ENUM_SLOTS[slot]:
        if s in (canon.lower(), _clean(label_of(canon))):
            return canon
    # 前缀 / 包含匹配（「奢华档」「五星级」）
    for key, canon in table.items():
        if key and (s.startswith(key) or key in s):
            return canon
    allowed = " / ".join(f"{label_of(v)}" for v in ENUM_SLOTS[slot])
    raise ValueError(f"{slot} 不接受「{raw}」，可选：{allowed}")


def normalize_slot_value(slot: str, value: Any) -> Any:
    """把顾问输入 / 追问选项归一化为规范值；不合法抛 ValueError（API 层转 VALUE_INVALID）。None 表示清空。"""
    if value is None or value == "" or value == []:
        return None
    if slot in LIST_SLOTS:
        items = value if isinstance(value, list) else re.split(r"[,，、/;；\s]+", str(value))
        items = [x for x in items if str(x).strip()]
        if slot == "child_ages":
            out_ages: list[int] = []
            for x in items:
                n = int(float(str(normalize_amount(str(x))).replace("岁", "")))
                if not 0 <= n <= 17:
                    raise ValueError(f"儿童年龄 {n} 超出 0–17")
                out_ages.append(n)
            return out_ages
        if slot == "interests":
            return [str(x).strip() for x in items]
        canon = [_norm_enum(slot, x) for x in items]
        seen: list[str] = []
        for c in canon:
            if c not in seen:
                seen.append(c)
        if slot == "dietary" and len(seen) > 1 and "none" in seen:
            seen.remove("none")
        return seen
    if slot in INT_SLOTS:
        n = normalize_amount(str(value)) if not isinstance(value, (int, float)) else value
        if isinstance(n, str):
            n = re.sub(r"[^0-9.]", "", n)
            if not n:
                raise ValueError(f"{slot} 需要数字")
            n = float(n)
        n = int(n) if float(n).is_integer() else float(n)
        limits = {"adults": (1, 30), "children": (0, 20), "duration_days": (1, 30), "budget_amount": (0, 100_000_000)}
        lo, hi = limits[slot]
        if not lo <= n <= hi:
            raise ValueError(f"{slot} 应在 {lo}–{hi} 之间")
        return int(n) if slot != "budget_amount" else n
    if slot in DATE_SLOTS:
        return normalize_date(str(value))
    if slot in ENUM_SLOTS:
        v = value[0] if isinstance(value, list) and value else value
        return _norm_enum(slot, v)
    return value
