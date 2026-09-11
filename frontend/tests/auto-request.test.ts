import { describe, expect, it } from "vitest";
import { AUTO_REQUEST } from "@/features/conversation/auto-request";

describe("AUTO_REQUEST", () => {
  it("保留关键缺口，用于演示多轮确认", () => {
    expect(AUTO_REQUEST).toMatch(/2 位成人/);
    expect(AUTO_REQUEST).toMatch(/5 岁儿童/);
    expect(AUTO_REQUEST).toMatch(/东京、箱根和京都/);
    expect(AUTO_REQUEST).not.toMatch(/总预算|含机票|饮食|无障碍/);
  });
});
