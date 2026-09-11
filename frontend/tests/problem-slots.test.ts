import { describe, expect, it } from "vitest";
import { needsCardFix, problemSlotsFor } from "@/lib/api/problem-slots";

describe("problemSlotsFor", () => {
  it("候选不足：从提示文字里识别档次 / 预算 / 日期，并并入冲突槽位", () => {
    const msg = "硬过滤后可用酒店不足 3 家，暂不生成。建议：放宽到全部档次可得 15 家酒店；放宽到奢华档可得 5 家酒店";
    const conflicts = [{ code: "C3", slots: ["hotel_tier", "child_ages"], message: "", suggestion: "" }];
    expect(problemSlotsFor("CANDIDATES_TOO_FEW", msg, conflicts)).toEqual(["hotel_tier", "child_ages"]);
    expect(problemSlotsFor("CANDIDATES_TOO_FEW", "每晚价格上限过低", [])).toEqual(["budget_amount"]);
  });
  it("其它失败只带冲突槽位；候选不足才需要回头改卡", () => {
    expect(problemSlotsFor("ORPHANED", null, [])).toEqual([]);
    expect(needsCardFix("CANDIDATES_TOO_FEW")).toBe(true);
    expect(needsCardFix("LLM_FAILED")).toBe(false);
  });
  it("优先使用后端明确返回的问题字段", () => {
    const details = { kind: "candidate_recovery" as const, problem_slots: ["date_start" as const, "hotel_tier" as const], missing_cities: ["东京"], candidate_counts: { 东京: 0 }, actions: [] };
    expect(problemSlotsFor("CANDIDATES_TOO_FEW", "酒店不足", [], details)).toEqual(["date_start", "hotel_tier"]);
  });
});
