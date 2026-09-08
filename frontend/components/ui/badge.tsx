import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "success" | "warning" | "info" | "danger" | "neutral" | "outline-danger";
const TONE: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted",
  "outline-danger": "border border-danger text-danger bg-surface",
};

export function Badge({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap", TONE[tone], className)} {...rest} />;
}
