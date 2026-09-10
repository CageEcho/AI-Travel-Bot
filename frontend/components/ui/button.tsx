import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/* 胶囊按钮：石板蓝主色；次级为白底浮起 */
const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-[#b9c2d0] shadow-[0_6px_16px_rgba(61,90,128,0.25)] disabled:shadow-none",
  secondary: "bg-surface text-text shadow-(--shadow-card) hover:bg-surface-2 disabled:text-muted",
  ghost: "bg-transparent text-primary hover:bg-primary-soft disabled:text-muted",
  danger: "bg-danger text-white hover:opacity-90",
};
const SIZE: Record<Size, string> = { sm: "h-9 px-4 text-[12px]", md: "h-11 px-5 text-[13px]" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:cursor-not-allowed min-h-[36px] active:scale-[0.98]",
        VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
