import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/* 白色圆角悬浮卡 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-surface rounded-(--radius-card) shadow-(--shadow-card)", className)} {...rest} />;
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 pt-4 pb-2 flex items-center gap-2 min-h-[44px]", className)} {...rest}>
      <span className="type-eyebrow">{children}</span>
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}
