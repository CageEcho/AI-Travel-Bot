import { STAGES, STAGE_LABEL, type TaskView } from "@/lib/api/task-state";
import { cn } from "@/lib/utils/cn";

export function TaskProgress({ view }: { view: TaskView }) {
  const idx = view.stage ? STAGES.indexOf(view.stage) : -1;
  return (
    <section aria-live="polite" className="mb-4">
      <ol className="grid grid-cols-4 gap-2" aria-label="生成阶段">
        {STAGES.map((s, i) => (
          <li key={s} className={cn("px-2 py-2 text-center text-[11.5px] font-semibold rounded-full",
            i < idx || view.state === "succeeded" ? "bg-primary-soft text-primary" : i === idx ? "bg-primary text-white shadow-[0_6px_16px_rgba(61,90,128,0.25)]" : "bg-surface-2 text-muted")}
            aria-current={i === idx ? "step" : undefined}>
            {STAGE_LABEL[s]}
          </li>
        ))}
      </ol>
      <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(view.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="生成进度">
        <div className="h-full rounded-full bg-primary transition-[width] duration-[360ms]" style={{ width: `${Math.round(view.progress * 100)}%` }} />
      </div>
      <p className="mt-2 text-sm"><b>{view.headline}</b></p>
      <p className="text-xs text-muted">{view.action} · {view.next}</p>
    </section>
  );
}
