import type { CSSProperties } from "react";
import { Calculator, Check, MapPin, Plane, Route, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { STAGES, STAGE_LABEL, type Stage, type TaskView } from "@/lib/api/task-state";
import { cn } from "@/lib/utils/cn";

const STAGE_ICON: Record<Stage, LucideIcon> = {
  searching: Search,
  planning: Route,
  validating: ShieldCheck,
  costing: Calculator,
};

const STAGE_DETAIL: Record<Stage, string> = {
  searching: "正在筛选住宿、餐厅、体验与用车资源",
  planning: "正在组合每天的路线、节奏与推荐理由",
  validating: "正在检查营业日、通勤、容量与饮食约束",
  costing: "正在按价格档、数量与服务费核算总价",
};

const ROUTE_LABELS = ["候选资源", "日程骨架", "约束检查", "报价结果"];

export function TaskProgress({ view }: { view: TaskView }) {
  const index = view.stage ? STAGES.indexOf(view.stage) : -1;
  const percent = Math.max(0, Math.min(100, Math.round(view.progress * 100)));
  const visualPercent = Math.max(4, Math.min(96, percent));
  const style = { "--journey-progress": `${visualPercent}%` } as CSSProperties;
  const detail = view.stage ? STAGE_DETAIL[view.stage] : "任务即将开始，正在准备生成环境";

  return (
    <section role="status" aria-live="polite" className="mb-4" data-testid="plan-loading-animation">
      <ol className="grid grid-cols-4 gap-2" aria-label="生成阶段">
        {STAGES.map((stage, stepIndex) => {
          const Icon = STAGE_ICON[stage];
          const done = stepIndex < index;
          const active = stepIndex === index;
          return (
            <li key={stage} aria-current={active ? "step" : undefined}
              className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-full px-2 text-center text-[11px] font-semibold transition-colors",
                done ? "bg-[#e9f7ec] text-[#278844]" : active ? "bg-primary text-white shadow-[0_6px_16px_rgba(61,90,128,0.22)]" : "bg-surface-2 text-muted")}>
              {done ? <Check className="size-3.5" aria-hidden="true" /> : <Icon className={cn("size-3.5", active && "journey-stage-icon")} aria-hidden="true" />}
              <span>{STAGE_LABEL[stage]}</span>
            </li>
          );
        })}
      </ol>

      <div className="journey-loader mt-3" style={style}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#2b9650]">BUILDING YOUR JOURNEY</p>
            <h3 className="mt-1.5 text-[15px] font-bold tracking-[-0.01em] text-[#1e2936]">{view.headline}</h3>
            <p className="mt-1 text-[11px] leading-5 text-[#748091]">{detail}</p>
          </div>
          <div className="journey-percent" role="progressbar" aria-label="生成进度" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <strong>{percent}</strong><span>%</span>
          </div>
        </div>

        <div className="journey-route mt-6" aria-hidden="true">
          <div className="journey-route-fill" />
          <span className="journey-plane"><Plane className="size-4" /></span>
          {ROUTE_LABELS.map((label, nodeIndex) => {
            const done = nodeIndex < index;
            const active = nodeIndex === index;
            return (
              <span key={label} className="journey-node-wrap" style={{ left: `${(nodeIndex / 3) * 100}%` }}>
                <span className={cn("journey-node", done && "is-done", active && "is-active")} />
                <span className={cn("journey-node-label", (nodeIndex === 0 || nodeIndex === 3) && "edge")}>{label}</span>
              </span>
            );
          })}
        </div>

        <div className="mt-9 space-y-2.5" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="journey-skeleton flex items-center gap-3 rounded-xl border border-[#e7ebef] bg-white px-3 py-2.5" style={{ "--skeleton-delay": item } as CSSProperties}>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#eef3f7] text-[10px] font-bold text-[#8090a1]">D{item + 1}</span>
              <span className="block min-w-0 flex-1 space-y-1.5"><i className="block h-2 w-[58%] rounded-full bg-[#e7ecf1]" /><i className="block h-1.5 w-[82%] rounded-full bg-[#f0f3f6]" /></span>
              <MapPin className="size-4 shrink-0 text-[#a8b3bf]" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2 text-[11px] leading-5 text-muted">
        <span className="inline-block size-1.5 shrink-0 rounded-full bg-[#54d66d] journey-live-dot" aria-hidden="true" />
        <span>{view.action} · {view.next}</span>
      </div>
    </section>
  );
}
