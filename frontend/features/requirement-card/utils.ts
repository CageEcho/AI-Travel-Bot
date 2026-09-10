import type { BadgeTone } from "@/components/ui/badge";
import type { RequirementCardView, SlotName, SlotValue } from "@/lib/api/types";

export const MUST_ASK: SlotName[] = ["dietary", "accessibility", "budget_basis", "budget_incl_flight"];

export interface SlotBadge { label: string; tone: BadgeTone }

/** 四态角标：客户原话 / 系统推断 / 顾问填写 / 必须确认；另叠加「有冲突」。 */
export function slotBadges(name: SlotName, sv: SlotValue | null | undefined, card: Pick<RequirementCardView, "conflicts" | "missing_slots">): SlotBadge[] {
  const out: SlotBadge[] = [];
  if (sv) {
    if (sv.source === "client_verbatim") out.push({ label: "✓ 客户原话", tone: "success" });
    else if (sv.source === "advisor_input") out.push({ label: "✎ 顾问填写", tone: "info" });
    else out.push({ label: `◐ 系统推断 ${Math.round(sv.confidence * 100)}%`, tone: "warning" });
  } else if (MUST_ASK.includes(name)) {
    out.push({ label: "● 必须确认", tone: "outline-danger" });
  } else if (card.missing_slots.includes(name)) {
    out.push({ label: "缺失", tone: "neutral" });
  }
  if (card.conflicts.some((c) => c.slots.includes(name))) out.push({ label: "⚠ 有冲突", tone: "danger" });
  return out;
}

export type SlotKind = "list" | "intList" | "int" | "enum" | "multiEnum" | "date" | "text";
export const SLOT_KIND: Record<SlotName, SlotKind> = {
  destination_cities: "multiEnum", date_start: "date", date_end: "date", duration_days: "int", adults: "int", children: "int",
  child_ages: "intList", budget_amount: "int", budget_basis: "enum", budget_incl_flight: "enum", hotel_tier: "multiEnum",
  dietary: "multiEnum", accessibility: "enum", interests: "list", pace: "enum",
};
export const SLOT_OPTIONS: Partial<Record<SlotName, string[]>> = {
  destination_cities: ["东京", "京都", "箱根"],
  budget_basis: ["total", "per_person"],
  budget_incl_flight: ["yes", "no", "undecided"],
  hotel_tier: ["4star", "5star", "luxury", "ryokan", "boutique"],
  dietary: ["none", "no_raw", "vegetarian", "vegan", "halal", "no_pork", "no_beef", "gluten_free", "no_shellfish"],
  accessibility: ["none", "wheelchair", "elderly_slow", "stroller"],
  pace: ["relaxed", "moderate", "packed"],
};

/** 追问选项文字 → 槽位值（选项是模型给的自然语言，尽量映射到枚举，映射不到就原样写入）。 */
const OPTION_TO_VALUE: Record<string, string> = {
  五星: "5star", 奢华: "luxury", 高端旅馆: "ryokan", 精品: "boutique", 四星: "4star", 温泉旅馆: "ryokan",
  总预算: "total", 每人: "per_person", 人均: "per_person", 总额: "total",
  含机票: "yes", 不含机票: "no", 未定: "undecided", 不含: "no", 包含: "yes",
  无: "none", 没有: "none", 忌生食: "no_raw", 不吃生食: "no_raw", 素食: "vegetarian", 清真: "halal", 不吃猪肉: "no_pork",
  轮椅: "wheelchair", 老人慢行: "elderly_slow", 婴儿车: "stroller", 放松: "relaxed", 适中: "moderate", 紧凑: "packed",
};
export function optionToSlotValue(slot: string, option: string): string | string[] | number {
  const v = OPTION_TO_VALUE[option.replace(/[（(].*$/, "").trim()] ?? option;
  const kind = SLOT_KIND[slot as SlotName];
  if (kind === "multiEnum" || kind === "list") return [v];
  if (kind === "int") { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isNaN(n) ? v : n; }
  return v;
}
