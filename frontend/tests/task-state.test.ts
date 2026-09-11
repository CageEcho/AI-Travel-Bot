import { describe, expect, it } from "vitest";
import { isTerminal, mapPlanStatus } from "@/lib/api/task-state";
import type { PlanStatus } from "@/lib/api/types";

const base: PlanStatus = { plan_id: "P", task_id: "T", status: "queued", progress: 0, replan_round: 0, version: null, error: null };

describe("mapPlanStatus", () => {
  it("queued 不伪装成正在生成", () => {
    const v = mapPlanStatus(base);
    expect(v.state).toBe("queued");
    expect(v.headline).toContain("已受理");
  });
  it("四个阶段映射为 running 并带阶段标签与回退轮数", () => {
    const v = mapPlanStatus({ ...base, status: "planning", progress: 0.5, replan_round: 2 });
    expect(v.state).toBe("running");
    expect(v.stage).toBe("planning");
    expect(v.headline).toContain("编排中");
    expect(v.headline).toContain("第 2 轮");
  });
  it("done → succeeded 并带版本号", () => {
    const v = mapPlanStatus({ ...base, status: "done", progress: 1, version: 1 });
    expect(v.state).toBe("succeeded");
    expect(v.version).toBe(1);
    expect(isTerminal(v.state)).toBe(true);
  });
  it("failed/ORPHANED 有专用文案", () => {
    const v = mapPlanStatus({ ...base, status: "failed", error: { code: "ORPHANED", message: "服务重启导致任务中断，请重新生成" } });
    expect(v.state).toBe("failed");
    expect(v.headline).toContain("服务重启");
    expect(v.action).toContain("重新生成");
  });
  it("候选不足时保留后端结构化恢复建议", () => {
    const details = {
      kind: "candidate_recovery" as const,
      problem_slots: ["date_start" as const],
      missing_cities: ["东京"],
      candidate_counts: { 东京: 0 },
      actions: [{ id: "date", label: "修改日期", description: "使用可用日期", patches: [{ slot: "date_start" as const, value: "2026-10-15" }] }],
    };
    const v = mapPlanStatus({ ...base, status: "failed", error: { code: "CANDIDATES_TOO_FEW", message: "酒店不足", details } });
    expect(v.errorDetails).toEqual(details);
  });
  it("未知状态 → stale，不当成功或失败", () => {
    const v = mapPlanStatus({ ...base, status: "embedding" });
    expect(v.state).toBe("stale");
    expect(isTerminal(v.state)).toBe(false);
  });
});
