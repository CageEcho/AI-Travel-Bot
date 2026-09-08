import type { ChecklistItem } from "@/lib/api/types";

export function ChecklistView({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">没有待核实项。</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">以下 {items.length} 项系统<b>无法判定</b>（字段未记录 / 非合约价），不等于通过，交付前必须人工核实。</p>
      {items.map((x, i) => (
        <div key={i} className="rounded border-l-[3px] border-warning bg-warning-soft px-3 py-2 text-sm">
          <b>{x.code}</b> Day {x.day_index} {x.resource_id && <code className="text-xs">{x.resource_id}</code>}
          <div>要核实：{x.what_to_verify}</div>
          <div className="text-xs text-muted">原因：{x.reason}</div>
        </div>
      ))}
    </div>
  );
}
