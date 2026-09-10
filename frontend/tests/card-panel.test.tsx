import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CardPanel } from "@/features/requirement-card/components/card-panel";
import type { RequirementCardView } from "@/lib/api/types";

const card: RequirementCardView = {
  card_id: "CRD-1", conv_id: "CNV-1", version: 1, completeness: 0.6, completeness_threshold: 0.85,
  missing_slots: ["dietary", "budget_basis"], conflicts: [], followups: [], confirmed: false, confirmed_at: null,
  slots: { adults: { value: 2, source: "client_verbatim", confidence: 0.95 }, hotel_tier: { value: ["luxury"], source: "advisor_input", confidence: 1 } },
};

describe("CardPanel", () => {
  it("必问项缺失：生成按钮禁用并说明缺什么", () => {
    render(<CardPanel card={card} loading={false} generating={false} onEdit={vi.fn()} onGenerate={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "确认需求卡并生成方案" });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/必问项未确认：饮食禁忌、预算口径/)).toBeInTheDocument();
    const row = (label: string) => within(screen.getByText(label).closest("li")!);
    expect(row("成人").getByText("✓ 客户原话")).toBeInTheDocument();
    expect(row("酒店档次").getByText("✎ 顾问填写")).toBeInTheDocument();
    expect(row("饮食禁忌").getByText("● 必须确认")).toBeInTheDocument();
    expect(row("预算口径").getByText("● 必须确认")).toBeInTheDocument();
  });
  it("存在冲突：即使完整度达标也不能生成", () => {
    render(<CardPanel card={{
      ...card,
      completeness: 0.9,
      missing_slots: [],
      conflicts: [{
        code: "DATE_DURATION_MISMATCH",
        message: "日期与天数冲突",
        slots: ["date_start", "date_end", "duration_days"],
        suggestion: "调整结束日期或旅行天数",
      }],
    }} loading={false} generating={false} onEdit={vi.fn()} onGenerate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "确认需求卡并生成方案" })).toBeDisabled();
    expect(screen.getByText(/存在未解决冲突，无法确认：DATE_DURATION_MISMATCH/)).toBeInTheDocument();
  });
  it("完整度达标：按钮可点；已确认时文案变为重新生成", () => {
    const onGenerate = vi.fn();
    render(<CardPanel card={{ ...card, completeness: 0.9, missing_slots: [], confirmed: true }} loading={false} generating={false} onEdit={vi.fn()} onGenerate={onGenerate} />);
    const btn = screen.getByRole("button", { name: "重新生成方案" });
    expect(btn).toBeEnabled();
    btn.click();
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
  it("加载中显示骨架屏而不是空数据", () => {
    render(<CardPanel card={null} loading onEdit={vi.fn()} onGenerate={vi.fn()} generating={false} />);
    expect(screen.queryByText("（未填）")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
  });
});
