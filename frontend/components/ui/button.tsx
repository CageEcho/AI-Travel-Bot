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

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-[#b9c4bf]",
  secondary: "bg-surface border border-border text-text hover:bg-surface-2 disabled:text-muted",
  ghost: "bg-transparent text-primary hover:bg-primary-soft disabled:text-muted",
  danger: "bg-danger text-white hover:opacity-90",
};
const SIZE: Record<Size, string> = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-medium transition-colors disabled:cursor-not-allowed min-h-[36px]",
        VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
