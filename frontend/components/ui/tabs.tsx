"use client";

import { cn } from "@/lib/utils/cn";

export interface TabItem<T extends string> { value: T; label: string; count?: number }

/* 分段控件：浅灰轨道里的白色胶囊 */
export function Tabs<T extends string>({ items, value, onChange, ariaLabel }: {
  items: TabItem<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div className="px-4 pt-4">
      <div role="tablist" aria-label={ariaLabel} className="inline-flex max-w-full gap-1 rounded-full bg-surface-2 p-1 overflow-x-auto">
        {items.map((t) => {
          const on = t.value === value;
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => onChange(t.value)}
              className={cn("px-3.5 h-9 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-all duration-[220ms]",
                on ? "bg-surface text-text shadow-(--shadow-card)" : "text-muted hover:text-text")}
            >
              {t.label}
              {t.count !== undefined && <span className={cn("ml-1.5 inline-flex min-w-[18px] justify-center rounded-full px-1.5 text-[10.5px]", on ? "bg-primary-soft text-primary" : "bg-surface text-muted")}>{t.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
