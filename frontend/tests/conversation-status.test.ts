import { describe, expect, it } from "vitest";
import { conversationStage, relativeTime } from "@/lib/api/conversation-status";

describe("conversationStage", () => {
  it("按方案状态、确认状态、完整度依次判定", () => {
    expect(conversationStage({ completeness: 0.4, confirmed: false, plan_status: null }).label).toBe("采集中 40%");
    expect(conversationStage({ completeness: 1, confirmed: true, plan_status: null }).label).toBe("已确认");
    expect(conversationStage({ completeness: 1, confirmed: true, plan_status: "planning" }).stage).toBe("generating");
    expect(conversationStage({ completeness: 1, confirmed: true, plan_status: "done" }).stage).toBe("done");
    expect(conversationStage({ completeness: 1, confirmed: true, plan_status: "failed" }).label).toBe("生成失败");
  });
});
describe("relativeTime", () => {
  it("分钟 / 小时 / 天 / 日期", () => {
    const now = new Date("2026-09-08T12:00:00Z").getTime();
    expect(relativeTime("2026-09-08T11:59:40Z", now)).toBe("刚刚");
    expect(relativeTime("2026-09-08T11:30:00Z", now)).toBe("30 分钟前");
    expect(relativeTime("2026-09-08T09:00:00Z", now)).toBe("3 小时前");
    expect(relativeTime("2026-09-06T09:00:00Z", now)).toBe("2 天前");
    expect(relativeTime("2026-08-01T09:00:00Z", now)).toBe("2026-08-01");
  });
});
