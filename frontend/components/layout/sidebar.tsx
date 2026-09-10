"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Plus, LayoutGrid, Search, LifeBuoy, PanelLeftClose, PanelLeftOpen, Cpu } from "lucide-react";
import { ConversationList } from "@/features/conversation/components/conversation-list";
import { conversationApi } from "@/features/conversation/api";
import { useConversations } from "@/features/conversation/hooks/use-conversations";
import { isAppError } from "@/lib/api/client";
import type { MetaInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { usePreference, writePreference } from "@/lib/utils/preference";
import { HelpDialog } from "./help-dialog";

const NAV = [
  { href: "/", label: "工作台", icon: LayoutGrid, match: (p: string) => p === "/" || p.startsWith("/c/") },
  { href: "/search", label: "手动检索", icon: Search, match: (p: string) => p.startsWith("/search") },
] as const;

/** 可展开侧栏：默认 72px 图标态，悬停临时展开，点按钮固定展开（偏好存本地）。 */
export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const activeId = pathname.match(/^\/c\/([^/?]+)/)?.[1] ?? null;
  const pinned = usePreference("xingce:sidebar") === "pinned";
  const [hover, setHover] = useState(false);
  const [help, setHelp] = useState(false);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const expanded = pinned || hover;
  const convs = useConversations(pathname);

  useEffect(() => {
    let alive = true;
    conversationApi.meta().then((m) => { if (alive) setMeta(m); }).catch(() => { if (alive) setMeta(null); });
    return () => { alive = false; };
  }, []);

  const togglePin = useCallback(() => writePreference("xingce:sidebar", pinned ? "collapsed" : "pinned"), [pinned]);

  const create = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try { const r = await conversationApi.create(); router.push(`/c/${r.conv_id}` as never); convs.refresh(); }
    catch (e) { alert(isAppError(e) ? e.userMessage : "创建会话失败"); }
    finally { setCreating(false); }
  }, [creating, router, convs]);

  const item = (icon: React.ReactNode, label: string, opts: { href?: string; onClick?: () => void; current?: boolean; key: string; badge?: string }) => {
    const cls = cn("flex items-center gap-3 h-11 rounded-full transition-all duration-[220ms] text-[13px] font-semibold",
      expanded ? "px-3 w-full" : "w-11 justify-center",
      opts.current ? "bg-primary text-white shadow-[0_6px_16px_rgba(61,90,128,0.25)]" : "text-muted hover:text-primary hover:bg-surface");
    const inner = <>{icon}{expanded && <span className="truncate">{label}</span>}{expanded && opts.badge && <span className="ml-auto text-[10px] text-muted">{opts.badge}</span>}</>;
    return opts.href
      ? <Link key={opts.key} href={opts.href as never} className={cls} aria-current={opts.current ? "page" : undefined} aria-label={label} title={label}>{inner}</Link>
      : <button key={opts.key} type="button" onClick={opts.onClick} className={cls} aria-label={label} title={label}>{inner}</button>;
  };

  return (
    <aside
      className={cn("hidden lg:flex flex-col shrink-0 py-4 px-3 gap-2 transition-[width] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]", expanded ? "w-[260px]" : "w-[72px]")}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label="侧栏导航">
      <div className={cn("flex items-center gap-3 mb-2", expanded ? "px-1" : "justify-center")}>
        <Link href="/" aria-label="行策首页" className="shrink-0"><span className="brand-mark-crop"><Image src="/brand/bdt-logo.png" alt="" width={476} height={467} priority /></span></Link>
        {expanded && <div className="leading-tight min-w-0"><div className="text-[15px] font-bold">行策</div><div className="text-[10.5px] text-muted truncate">Beyond Dream Travel</div></div>}
        {expanded && <button type="button" onClick={togglePin} className="ml-auto icon-btn !w-8 !h-8 !shadow-none" aria-label={pinned ? "收起侧栏" : "固定展开侧栏"} title={pinned ? "收起侧栏" : "固定展开"}>{pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}</button>}
      </div>
      <button type="button" onClick={create} disabled={creating}
        className={cn("flex items-center gap-3 h-11 rounded-full bg-surface shadow-(--shadow-card) text-primary text-[13px] font-semibold hover:bg-primary-soft transition-colors disabled:opacity-60", expanded ? "px-3 w-full" : "w-11 justify-center")}
        aria-label="新建会话" title="新建会话">
        <Plus className="size-[18px]" aria-hidden="true" />{expanded && <span>新建会话</span>}
      </button>
      {NAV.map((n) => item(<n.icon className="size-[18px]" aria-hidden="true" />, n.label, { href: n.href, current: n.match(pathname) && !(n.href === "/" && activeId), key: n.href }))}
      {expanded && (
        <div className="mt-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-3 mb-1.5"><span className="type-eyebrow">最近会话</span>{convs.items && <span className="text-[11px] text-muted">{convs.items.length}</span>}</div>
          <div className="flex-1 min-h-0 overflow-auto -mx-1 px-1">
            <ConversationList items={convs.items} loading={convs.loading} error={convs.error?.userMessage ?? null} activeId={activeId} onRetry={convs.refresh} />
          </div>
        </div>
      )}
      {!expanded && <div className="flex-1" />}
      <div className="mt-2 space-y-2">
        {item(<Cpu className={cn("size-[18px]", meta && !meta.llm_configured && "text-danger")} aria-hidden="true" />,
          meta ? `${meta.provider === "deepseek" ? "DeepSeek" : "Claude"} · ${meta.planner_mode === "llm" ? "模型编排" : "降级模式"}` : "模型状态",
          { onClick: () => setHelp(true), key: "model", badge: meta ? (meta.llm_configured ? "已配置" : "未配置") : undefined })}
        {item(<LifeBuoy className="size-[18px]" aria-hidden="true" />, "帮助与说明", { onClick: () => setHelp(true), key: "help" })}
      </div>
      <HelpDialog open={help} onClose={() => setHelp(false)} meta={meta} />
    </aside>
  );
}
