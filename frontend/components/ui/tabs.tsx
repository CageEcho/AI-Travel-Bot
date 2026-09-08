"use client";

import { cn } from "@/lib/utils/cn";

export interface TabItem<T extends string> { value: T; label: string; count?: number }

export function Tabs<T extends string>({ items, value, onChange, ariaLabel }: {
  items: TabItem<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 px-2 pt-1.5 border-b border-border overflow-x-auto">
      {items.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn("px-3 py-2 text-sm rounded-t-lg whitespace-nowrap min-h-[40px]",
              on ? "bg-surface-2 text-text font-semibold" : "text-muted hover:text-text")}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-xs text-muted">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
