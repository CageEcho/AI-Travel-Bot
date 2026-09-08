import { describe, expect, it } from "vitest";
import { formatSlotValue, money } from "@/lib/utils/format";
import { optionToSlotValue, slotBadges } from "@/features/requirement-card/utils";

describe("formatSlotValue", () => {
  it("枚举转中文、数组用顿号连接、数字千分位", () => {
    expect(formatSlotValue(["5star", "luxury"])).toBe("五星、奢华");
    expect(formatSlotValue("per_person")).toBe("每人");
    expect(formatSlotValue(150000)).toBe("150,000");
    expect(formatSlotValue(null)).toBe("");
  });
});

describe("slotBadges 四态角标", () => {
  const card = { conflicts: [{ code: "C1", slots: ["budget_amount"], message: "", suggestion: "" }], missing_slots: ["adults"] };
  it("客户原话 / 顾问填写 / 系统推断", () => {
    expect(slotBadges("adults", { value: 2, source: "client_verbatim", confidence: 1 }, card)[0].label).toContain("客户原话");
    expect(slotBadges("adults", { value: 2, source: "advisor_input", confidence: 1 }, card)[0].label).toContain("顾问填写");
    expect(slotBadges("adults", { value: 2, source: "system_inferred", confidence: 0.6 }, card)[0].label).toContain("60%");
  });
  it("缺失的必问项标「必须确认」，冲突叠加「有冲突」", () => {
    expect(slotBadges("dietary", null, card)[0].label).toContain("必须确认");
    expect(slotBadges("budget_amount", { value: 80000, source: "client_verbatim", confidence: 1 }, card).map((b) => b.label)).toContain("⚠ 有冲突");
  });
});

describe("optionToSlotValue", () => {
  it("追问选项映射为枚举/列表", () => {
    expect(optionToSlotValue("hotel_tier", "奢华")).toEqual(["luxury"]);
    expect(optionToSlotValue("budget_basis", "总预算")).toBe("total");
    expect(optionToSlotValue("dietary", "忌生食")).toEqual(["no_raw"]);
    expect(optionToSlotValue("adults", "3人")).toBe(3);
  });
});

describe("money", () => {
  it("字符串 Decimal 千分位两位小数", () => {
    expect(money("2357024.40")).toBe("2,357,024.40");
    expect(money(null)).toBe("—");
  });
});
