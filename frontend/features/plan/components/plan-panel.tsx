"use client";

import { useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import type { PlanTask } from "../hooks/use-plan-task";
import { ChecklistView } from "./checklist-view";
import { CostView } from "./cost-view";
import { DayCard } from "./day-card";
import { TaskProgress } from "./task-progress";
import { TraceView } from "./trace-view";
import { cn } from "@/lib/utils/cn";
import { needsCardFix } from "@/lib/api/problem-slots";
import type { RequirementCardView } from "@/lib/api/types";
import { ProposalDialog } from "./proposal-dialog";

export type PlanTab = "plan" | "cost" | "check" | "trace";
const TABS: { value: PlanTab; label: string }[] = [
  { value: "plan", label: "方案" }, { value: "cost", label: "成本" }, { value: "check", label: "待核实清单" }, { value: "trace", label: "检索过程" },
];

export function PlanPanel({ task, card, hasPlanId, tab, onTab, onRegenerate, onFixCard, canRegenerate, className }: {
  task: PlanTask; hasPlanId: boolean; tab: PlanTab; onTab: (t: PlanTab) => void; onRegenerate: () => void;
  card: RequirementCardView | null;
  /** 回到需求卡并定位到有问题的槽位 */
  onFixCard: () => void; canRegenerate: boolean; className?: string;
}) {
  const { view, plan, trace, loading, error, disconnected } = task;
  const [proposalOpen, setProposalOpen] = useState(false);
  const counts = plan ? { check: plan.checklist.length } : {};
  return (
    <Card className={cn("flex flex-col min-h-0", className)}>
      <Tabs ariaLabel="方案面板" value={tab} onChange={onTab}
        items={TABS.filter((t) => t.value !== "cost" || !plan || plan.cost_visible)
          .map((t) => ({ ...t, count: t.value === "check" ? counts.check : undefined }))} />
      <div key={tab} className="flex-1 min-h-0 overflow-auto p-4 fade-enter">
        {!hasPlanId && <p className="text-sm text-muted">确认需求卡并生成后，这里显示按天行程、成本结构与待核实清单。悬停 ⓘ 查看每个条目的溯源。</p>}
        {hasPlanId && loading && <div className="space-y-3" aria-busy="true"><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>}
        {error && <Alert tone="danger">{error.userMessage}</Alert>}
        {disconnected && (
          <Alert tone="warning" className="mb-3" action={<Button size="sm" variant="secondary" onClick={task.refresh}><RefreshCw className="size-3" aria-hidden="true" />重试</Button>}>
            与服务端的连接中断。任务未必已停止，正在自动重连。
          </Alert>
        )}
        {view && view.state !== "succeeded" && view.state !== "failed" && <TaskProgress view={view} />}
        {view?.state === "failed" && (
          <Alert tone="danger" className="mb-3"
            action={needsCardFix(view.errorCode)
              ? <Button size="sm" onClick={onFixCard}>回到需求卡修改</Button>
              : canRegenerate ? <Button size="sm" onClick={onRegenerate}>重新生成</Button> : undefined}>
            <b>{view.headline}</b>
            <div className="text-xs">{needsCardFix(view.errorCode) ? "条件不改，重试结果不会变。请按建议放宽档次、预算或日期后再生成" : `${view.action} · ${view.next}`}</div>
          </Alert>
        )}
        {plan && view?.state === "succeeded" && (
          <>
            <section className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#dfe7e1] bg-[#f5faf6] px-4 py-3">
              <div className="min-w-0 flex-1">
                <b className="block text-[13px] text-[#172019]">客户交付版本已就绪</b>
                <span className="text-[11px] leading-5 text-[#66716a]">图文排版会隐藏内部成本轨迹、资源 ID 与模型信息，可导出 PDF 或长图。</span>
              </div>
              <Button size="sm" onClick={() => setProposalOpen(true)} disabled={plan.blocking_count > 0}>
                <Eye className="size-3.5" />客户版预览与导出
              </Button>
              {plan.blocking_count > 0 && <span className="w-full text-[11px] text-danger">存在硬约束违规，修正后才能导出客户版本。</span>}
            </section>
            <Alert tone={plan.blocking_count > 0 ? "danger" : "success"} className="mb-3">
              {plan.blocking_count > 0
                ? <>硬约束 <b>{plan.blocking_count}</b> 项违反，已回退重排 {plan.replan_rounds} 轮仍未消除，需人工处理 · 待核实 {plan.unknown_count} 项</>
                : <>硬约束 <b>0</b> 项违反 · 待核实 {plan.unknown_count} 项 · 回退重排 {plan.replan_rounds} 轮</>}
            </Alert>
            {tab === "plan" && (
              <>
                {plan.structure.assumptions.length > 0 && <p className="mb-3 rounded border-l-[3px] border-warning bg-warning-soft px-3 py-2 text-xs"><b>编排假设：</b>{plan.structure.assumptions.join("；")}</p>}
                {plan.structure.days.map((d) => <DayCard key={d.day_index} day={d} blocking={plan.violations.filter((v) => v.blocking && v.day_index === d.day_index)} />)}
                <p className="text-[11px] text-muted mt-2">{plan.synthetic_notice}</p>
              </>
            )}
            {tab === "cost" && (plan.cost ? <CostView cost={plan.cost} /> : <Alert tone="warning">当前账号没有查看净价与成本明细的权限。</Alert>)}
            {tab === "check" && <ChecklistView items={plan.checklist} />}
            {tab === "trace" && <TraceView trace={trace} />}
          </>
        )}
      </div>
      {plan && <ProposalDialog open={proposalOpen} onClose={() => setProposalOpen(false)} plan={plan} card={card} />}
    </Card>
  );
}
