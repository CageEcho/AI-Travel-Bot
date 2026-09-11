import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanPanel } from "@/features/plan/components/plan-panel";
import type { PlanTask } from "@/features/plan/hooks/use-plan-task";
import type { RecoveryAction } from "@/lib/api/types";

const action: RecoveryAction = {
  id: "use_demo_date",
  label: "改为 2026-10-15 出发",
  description: "使用演示资源覆盖充分的日期",
  patches: [{ slot: "date_start", value: "2026-10-15" }, { slot: "date_end", value: null }],
};

const task: PlanTask = {
  view: {
    state: "failed", stage: null, progress: 0.1, replanRound: 0, version: null,
    errorCode: "CANDIDATES_TOO_FEW", errorMessage: "东京缺少可用酒店。请选择建议修改后继续生成。",
    errorDetails: { kind: "candidate_recovery", problem_slots: ["date_start", "hotel_tier"], missing_cities: ["东京"], candidate_counts: { 东京: 0 }, actions: [action] },
    headline: "生成失败", action: "修改条件", next: "重新生成",
  },
  plan: null, trace: null, loading: false, error: null, disconnected: false, refresh: vi.fn(),
};

describe("PlanPanel recovery", () => {
  it("展示可执行建议，点击后交给工作台自动修复", async () => {
    const onRecover = vi.fn();
    render(<PlanPanel task={task} card={null} hasPlanId tab="plan" onTab={vi.fn()} onRegenerate={vi.fn()}
      onFixCard={vi.fn()} onRecover={onRecover} recovering={false} canRegenerate={false} />);
    expect(screen.getByText("当前条件需要调整后才能继续")).toBeInTheDocument();
    expect(screen.getByText("本次酒店候选：东京 0 家")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /改为 2026-10-15 出发/ }));
    expect(onRecover).toHaveBeenCalledWith(action);
  });
});
