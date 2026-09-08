import { STAGES, STAGE_LABEL, type TaskView } from "@/lib/api/task-state";
import { cn } from "@/lib/utils/cn";

export function TaskProgress({ view }: { view: TaskView }) {
  const idx = view.stage ? STAGES.indexOf(view.stage) : -1;
  return (
    <section aria-live="polite" className="mb-4">
      <ol className="grid grid-cols-4 gap-2" aria-label="生成阶段">
        {STAGES.map((s, i) => (
          <li key={s} className={cn("rounded-(--radius-control) px-2 py-2 text-center text-xs",
            i < idx || view.state === "succeeded" ? "bg-primary-soft text-primary" : i === idx ? "bg-primary text-white" : "bg-surface-2 text-muted")}
            aria-current={i === idx ? "step" : undefined}>
            {STAGE_LABEL[s]}
          </li>
        ))}
      </ol>
      <div className="mt-2 h-1.5 rounded bg-border/60 overflow-hidden" role="progressbar" aria-valuenow={Math.round(view.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="生成进度">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(view.progress * 100)}%` }} />
      </div>
      <p className="mt-2 text-sm"><b>{view.headline}</b></p>
      <p className="text-xs text-muted">{view.action} · {view.next}</p>
    </section>
  );
}
