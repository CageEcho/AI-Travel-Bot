import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Tone = "info" | "success" | "warning" | "danger";
const TONE: Record<Tone, string> = {
  info: "bg-info-soft text-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
const ICON: Record<Tone, typeof Info> = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({ tone = "info", children, className, action }: { tone?: Tone; children: ReactNode; className?: string; action?: ReactNode }) {
  const Icon = ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-(--radius-control) px-3.5 py-2.5 text-sm", TONE[tone], className)}>
      <Icon className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">{children}</div>
      {action}
    </div>
  );
}
