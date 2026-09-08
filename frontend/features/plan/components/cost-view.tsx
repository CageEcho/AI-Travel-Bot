import type { CostSummary } from "@/lib/api/types";
import { COST_CATEGORY_LABEL, money } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function CostView({ cost }: { cost: CostSummary }) {
  const total = Number(cost.total) || 1;
  const variance = cost.variance_pct === null ? null : Number(cost.variance_pct);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Kpi label="地面总计（JPY，含服务费）" value={`¥${money(cost.total)}`} />
        <Kpi label={`折人民币（汇率 ${cost.fx_rate}）`} value={`￥${money(cost.total_cny)}`} />
        <Kpi label="人均（JPY）" value={`¥${money(cost.per_person)}`} />
        <Kpi label={`相对预算 ${cost.budget_target ? "￥" + money(cost.budget_target, 0) : "（未填预算）"}`}
          value={variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance}%`} tone={variance === null ? undefined : variance > 0 ? "danger" : "success"} />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted text-left"><th className="py-1.5">类别</th><th className="py-1.5 text-right">金额（JPY）</th><th className="py-1.5 text-right">占比</th></tr></thead>
        <tbody>
          {Object.entries(cost.breakdown).map(([k, v]) => (
            <tr key={k} className="border-t border-border"><td className="py-1.5">{COST_CATEGORY_LABEL[k] ?? k}</td><td className="py-1.5 text-right tabular-nums">{money(v)}</td><td className="py-1.5 text-right tabular-nums text-muted">{((Number(v) / total) * 100).toFixed(1)}%</td></tr>
          ))}
        </tbody>
      </table>
      <details className="rounded-(--radius-control) border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm text-info">计算轨迹 · {cost.lines.length} 条明细 · 服务费率 {cost.service_fee_rate} · 汇率时间 {cost.fx_time.slice(0, 19).replace("T", " ")}</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead><tr className="text-muted text-left"><th className="px-3 py-1.5">Day</th><th className="py-1.5">类别</th><th className="py-1.5">资源</th><th className="py-1.5">价格档</th><th className="py-1.5">计算轨迹</th><th className="py-1.5 text-right pr-3">金额</th></tr></thead>
            <tbody>
              {cost.lines.map((l, i) => (
                <tr key={i} className="border-t border-border"><td className="px-3 py-1.5">{l.day_index ?? ""}</td><td>{COST_CATEGORY_LABEL[l.category]}</td><td><code>{l.resource_id}</code></td><td><code>{l.rate_id}</code></td><td><code className="bg-surface-2 px-1 rounded">{l.rule_trace}</code></td><td className="text-right tabular-nums pr-3">{money(l.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {cost.missing_rates.length > 0 && (
        <p className="rounded border-l-[3px] border-warning bg-warning-soft px-3 py-2 text-xs">以下资源未找到价格档，未计入成本：{cost.missing_rates.join("、")}</p>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-(--radius-control) border border-border bg-surface-2 px-3 py-2">
      <b className={cn("block text-lg tabular-nums", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</b>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
