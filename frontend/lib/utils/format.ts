import type { SlotName, SlotPrimitive } from "@/lib/api/types";

export const SLOT_LABEL: Record<SlotName, string> = {
  destination_cities: "目的地", date_start: "出发日期", date_end: "结束日期", duration_days: "天数", adults: "成人",
  children: "儿童", child_ages: "儿童年龄", budget_amount: "预算（元）", budget_basis: "预算口径", budget_incl_flight: "含机票",
  hotel_tier: "酒店档次", dietary: "饮食禁忌", accessibility: "无障碍", interests: "兴趣偏好", pace: "节奏",
};

export const ENUM_LABEL: Record<string, string> = {
  total: "总预算", per_person: "每人", yes: "含机票", no: "不含机票", undecided: "未定",
  "4star": "四星", "5star": "五星", luxury: "奢华", ryokan: "高端旅馆", boutique: "精品",
  no_raw: "忌生食", vegetarian: "素食", vegan: "纯素", halal: "清真", no_pork: "不吃猪肉", no_beef: "不吃牛肉",
  gluten_free: "无麸质", no_shellfish: "忌贝类", none: "无",
  wheelchair: "轮椅", elderly_slow: "老人慢行", stroller: "婴儿车",
  relaxed: "放松", moderate: "适中", packed: "紧凑",
};

export function labelOf(v: string): string {
  return ENUM_LABEL[v] ?? v;
}

export function formatSlotValue(v: SlotPrimitive | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return (v as Array<string | number>).map((x) => labelOf(String(x))).join("、");
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "number") return v.toLocaleString("zh-CN");
  return labelOf(v);
}

export const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const ITEM_SLOT_LABEL: Record<string, string> = {
  morning: "上午", lunch: "午餐", afternoon: "下午", dinner: "晚餐", evening: "晚间", accommodation: "住宿", transport: "交通",
};
export const ITEM_TYPE_LABEL: Record<string, string> = {
  hotel: "酒店", restaurant: "餐厅", poi: "景点", vehicle: "用车", transfer: "转场", free_time: "自由活动",
};
export const COST_CATEGORY_LABEL: Record<string, string> = {
  accommodation: "住宿", transport: "交通", dining: "餐饮", tickets: "门票", service_fee: "服务费",
};

export function money(v: string | number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}
