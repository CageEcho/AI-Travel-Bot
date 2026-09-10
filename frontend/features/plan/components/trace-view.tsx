import type { TraceResponse } from "@/lib/api/types";

const FUNNEL_LABEL: Record<string, string> = { city_active: "城市", tier: "档次", availability_h8: "可售期 H8", capacity_h1: "容量 H1" };

export function TraceView({ trace }: { trace: TraceResponse | null }) {
  if (!trace) return <p className="text-sm text-muted">暂无轨迹数据。</p>;
  const search = trace.steps.find((s) => s.step === "search");
  const funnels = (search?.payload?.funnels ?? {}) as Record<string, Record<string, number>>;
  return (
    <div className="space-y-4">
      {Object.entries(funnels).map(([city, f]) => {
        const max = Math.max(1, f.city_active ?? 1);
        return (
          <section key={city}>
            <h4 className="text-sm font-semibold mb-1">{city} · 酒店硬过滤漏斗</h4>
            <ol className="flex items-end gap-1.5 h-24" aria-label={`${city}检索漏斗`}>
              {["city_active", "tier", "availability_h8", "capacity_h1"].map((k) => (
                <li key={k} className="flex-1 flex flex-col justify-end text-center text-[11px]">
                  {/* 用像素高度：百分比高度在 flex 子项里不可靠 */}
                  <div className="bg-primary text-white rounded-t-lg flex items-end justify-center pb-0.5" style={{ height: `${Math.max(14, Math.round(((f[k] ?? 0) / max) * 72))}px` }}>{f[k] ?? 0}</div>
                  <span className="text-muted mt-0.5">{FUNNEL_LABEL[k]}</span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {search && (
        <p className="text-xs text-muted">候选池：酒店 {String(search.payload?.hotels)} · 餐厅 {String(search.payload?.restaurants)} · 景点 {String(search.payload?.pois)} · 车辆 {String(search.payload?.vehicles)}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead><tr className="text-muted text-left"><th className="py-1.5">步骤</th><th>耗时 ms</th><th>输入 token</th><th>输出 token</th><th>说明</th></tr></thead>
          <tbody>
            {trace.steps.map((s) => {
              const payload = Object.fromEntries(Object.entries(s.payload ?? {}).filter(([k]) => !["funnels", "relaxation_hints"].includes(k)));
              return (
                <tr key={s.trace_id} className="border-t border-border"><td className="py-1.5">{s.step}</td><td>{s.latency_ms ?? ""}</td><td>{s.input_tokens ?? ""}</td><td>{s.output_tokens ?? ""}</td>
                  <td><code className="break-all">{JSON.stringify(payload).slice(0, 200)}</code></td></tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
