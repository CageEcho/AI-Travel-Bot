import type { Conflict, RecoveryDetails, SlotName } from "./types";

/** 生成失败 / 需求卡冲突 → 顾问应回头修改的槽位（去重、按出现顺序）。 */
export function problemSlotsFor(errorCode: string | null, errorMessage: string | null, conflicts: Conflict[], details?: RecoveryDetails | null): SlotName[] {
  const out: SlotName[] = [];
  const add = (s: string) => { if (!out.includes(s as SlotName)) out.push(s as SlotName); };
  if (errorCode === "CANDIDATES_TOO_FEW") {
    for (const slot of details?.problem_slots ?? []) add(slot);
    const msg = errorMessage ?? "";
    if (/档|星|奢华|旅馆|精品/.test(msg)) add("hotel_tier");
    if (/价|预算/.test(msg)) add("budget_amount");
    if (/日期|日子|月/.test(msg)) add("date_start");
    if (/城市|目的地/.test(msg)) add("destination_cities");
    if (!out.length) add("hotel_tier");
  }
  for (const c of conflicts) for (const s of c.slots) add(s);
  return out;
}

/** 不改需求卡直接重试没有意义的错误（检索是确定性的）。 */
export function needsCardFix(errorCode: string | null): boolean {
  return errorCode === "CANDIDATES_TOO_FEW";
}
