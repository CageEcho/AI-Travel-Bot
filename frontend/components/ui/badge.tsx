import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "success" | "warning" | "info" | "danger" | "neutral" | "outline-danger";
/* 胶囊徽标：浅色底 + 语义色文字（参考图里的 +$ / -$ 小标） */
const TONE: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted",
  "outline-danger": "bg-surface text-danger ring-1 ring-inset ring-danger/50",
};

export function Badge({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap", TONE[tone], className)} {...rest} />;
}
