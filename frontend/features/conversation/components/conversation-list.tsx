"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { conversationStage, relativeTime, type ConvStage } from "@/lib/api/conversation-status";
import type { ConversationSummary } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

const DOT: Record<ConvStage, string> = { collecting: "bg-warning", confirmed: "bg-info", generating: "bg-primary animate-pulse", done: "bg-success", failed: "bg-danger" };

export function ConversationList({ items, loading, error, activeId, onNavigate, onRetry }: {
  items: ConversationSummary[] | null; loading: boolean; error: string | null; activeId: string | null; onNavigate?: () => void; onRetry?: () => void;
}) {
  if (loading) return <div className="space-y-2 px-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>;
  if (error) return <p className="px-3 text-[12px] text-danger">{error} {onRetry && <button type="button" className="underline" onClick={onRetry}>重试</button>}</p>;
  if (!items || items.length === 0) return <p className="px-3 text-[12px] text-muted">还没有会话。点上方「新建会话」开始。</p>;
  return (
    <ul className="space-y-1 px-2" aria-label="最近会话">
      {items.map((c) => {
        const st = conversationStage(c);
        const href = c.plan_id && (st.stage === "done" || st.stage === "generating") ? `/c/${c.conv_id}?plan=${c.plan_id}&tab=plan` : `/c/${c.conv_id}`;
        const active = c.conv_id === activeId;
        return (
          <li key={c.conv_id}>
            <Link href={href as never} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("block rounded-xl px-3 py-2 transition-colors", active ? "bg-primary-soft" : "hover:bg-surface-2")}>
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full shrink-0", DOT[st.stage])} aria-hidden="true" />
                <span className={cn("truncate text-[13px]", active ? "font-semibold text-primary" : "text-text")}>{c.title}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted">
                <span>{st.label}</span><span>{relativeTime(c.last_activity_at)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
