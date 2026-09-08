import type { RenderedDay, Violation } from "@/lib/api/types";
import { ITEM_SLOT_LABEL, ITEM_TYPE_LABEL, WEEKDAY } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { ProvenancePopover } from "./provenance-popover";

export function DayCard({ day, blocking }: { day: RenderedDay; blocking: Violation[] }) {
  return (
    <article className="rounded-(--radius-card) border border-border mb-3 overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-surface-2 px-3 py-2 text-sm border-b border-border">
        <b>Day {day.day_index}</b>
        <span className="text-muted">{day.date} {WEEKDAY[day.weekday]}</span>
        <span>{day.city}{day.is_transfer && " · 转场"}</span>
        <span className="text-muted">{day.theme}</span>
        <span className="ml-auto text-xs text-muted">通勤估算 {day.commute_min_est ?? "—"} 分钟</span>
      </header>
      {blocking.map((v, i) => (
        <div key={i} role="alert" className="mx-3 mt-2 rounded border-l-[3px] border-danger bg-danger-soft px-3 py-1.5 text-xs text-danger">{v.code} {v.message}</div>
      ))}
      <ul>
        {day.items.map((it, i) => (
          <li key={i} className={cn("grid grid-cols-[64px_56px_1fr_32px] gap-2 items-center px-3 py-2 text-sm border-b border-dashed border-border last:border-b-0",
            it.status === "blocked" && "bg-danger-soft")}>
            <span className="text-muted text-xs">{ITEM_SLOT_LABEL[it.slot] ?? it.slot}{it.start_time && <><br />{it.start_time}</>}</span>
            <span className="rounded-full bg-surface-2 text-center text-[11px] py-0.5">{ITEM_TYPE_LABEL[it.type] ?? it.type}</span>
            <span className="min-w-0">
              {it.status === "blocked" ? (
                <><b className="text-danger">已拦截</b> <span className="text-xs">{it.block_reason}</span></>
              ) : it.type === "free_time" ? "自由活动" : (
                <>
                  <b>{it.name_zh ?? "—"}</b>
                  {it.name_local && <span className="text-muted text-xs ml-1">{it.name_local}</span>}
                  {typeof it.facts?.room_name === "string" && <span className="text-xs"> · {it.facts.room_name}</span>}
                  {it.nights && <span className="text-xs"> · 连住 {it.nights} 晚</span>}
                </>
              )}
              {it.reason_note && <div className="text-xs text-muted">{it.reason_note}</div>}
            </span>
            <span className="justify-self-end">{it.status === "ok" && <ProvenancePopover item={it} />}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
