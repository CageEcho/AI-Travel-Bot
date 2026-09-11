import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskProgress } from "@/features/plan/components/task-progress";
import type { TaskView } from "@/lib/api/task-state";

const view: TaskView = {
  state: "running",
  stage: "planning",
  progress: 0.5,
  replanRound: 0,
  version: null,
  errorCode: null,
  errorMessage: null,
  errorDetails: null,
  headline: "编排中",
  action: "可以离开页面，任务在服务端继续",
  next: "完成后自动进入下一阶段",
};

describe("TaskProgress", () => {
  it("展示真实阶段、百分比和持续反馈动画", () => {
    render(<TaskProgress view={view} />);
    expect(screen.getByRole("status")).toHaveTextContent("编排中");
    expect(screen.getByRole("status")).toHaveTextContent("正在组合每天的路线、节奏与推荐理由");
    expect(screen.getByRole("progressbar", { name: "生成进度" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.queryByText("规划中")).not.toBeInTheDocument();
    expect(screen.getByText("编排中", { selector: "li span" }).closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("plan-loading-animation")).toBeInTheDocument();
  });
});
