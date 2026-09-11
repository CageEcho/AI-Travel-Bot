"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Clock3, Menu, Plus, X } from "lucide-react";
import { AuthRedirect } from "@/components/auth/auth-redirect";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConversationList } from "@/features/conversation/components/conversation-list";
import { useConversations } from "@/features/conversation/hooks/use-conversations";
import { conversationApi } from "@/features/conversation/api";
import { isAppError } from "@/lib/api/client";
import type { MetaInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { HelpDialog } from "./help-dialog";

const NAV = [
  { href: "/", label: "工作台", match: (path: string) => path === "/" || path.startsWith("/c/") },
  { href: "/search", label: "旅行灵感", match: (path: string) => path.startsWith("/search") },
] as const;

/** 顶部常驻导航：保留最近会话、帮助与模型状态，同时与新版首页共用同一栅格。 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const activeId = pathname.match(/^\/c\/([^/?]+)/)?.[1] ?? null;
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const conversations = useConversations(conversationsOpen ? `${pathname}#recent` : "closed");

  useEffect(() => {
    let alive = true;
    conversationApi.meta().then((value) => { if (alive) setMeta(value); }).catch(() => { if (alive) setMeta(null); });
    return () => { alive = false; };
  }, []);

  async function createConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const result = await conversationApi.create();
      setConversationsOpen(false);
      router.push(`/c/${result.conv_id}` as never);
    } catch (error) {
      alert(isAppError(error) ? error.userMessage : "创建会话失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <AuthRedirect />
      <header className="site-header">
        <div className="site-container flex h-[68px] items-center gap-5">
          <Link href="/" aria-label="Beyond Dream Travel 行策首页" className="flex shrink-0 items-center gap-2.5">
            <Image src="/brand/bdt-icon.png" alt="" width={36} height={36} priority className="brand-icon-clip size-9 object-contain" />
            <span className="hidden text-[17px] font-bold tracking-[-0.025em] text-[#171a1f] sm:inline">BEYOND DREAM TRAVEL <span className="font-semibold">· 行程</span></span>
          </Link>

          <nav className="ml-auto hidden items-center gap-7 md:flex" aria-label="主导航">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.match(pathname) ? "page" : undefined}
                className="site-nav-link">{item.label}</Link>
            ))}
            <button type="button" onClick={() => setHelpOpen(true)} className="site-nav-link">帮助中心</button>
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <button type="button" onClick={() => setConversationsOpen(true)} className="top-utility" aria-label="打开最近会话">
              <Clock3 className="size-4" aria-hidden="true" />最近会话
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-[#1e9f45]">
              <span className={cn("size-2 rounded-full", meta?.llm_configured === false ? "bg-warning" : "bg-[#20bf55]")} aria-hidden="true" />
              AI 行程设计·内测
            </button>
          </div>

          <button type="button" onClick={() => setMobileOpen((value) => !value)} className="ml-auto inline-flex size-10 items-center justify-center rounded-lg border border-border bg-white md:hidden" aria-label={mobileOpen ? "关闭导航" : "打开导航"}>
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-border bg-white px-4 pb-4 md:hidden">
            <nav className="site-container grid gap-1 py-2" aria-label="移动端导航">
              {NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold hover:bg-surface-2">{item.label}</Link>)}
              <button type="button" onClick={() => { setMobileOpen(false); setConversationsOpen(true); }} className="rounded-lg px-3 py-3 text-left text-sm font-semibold hover:bg-surface-2">最近会话</button>
              <button type="button" onClick={() => { setMobileOpen(false); setHelpOpen(true); }} className="rounded-lg px-3 py-3 text-left text-sm font-semibold hover:bg-surface-2">帮助中心</button>
            </nav>
          </div>
        )}
      </header>

      <main className={cn("min-h-[calc(100vh-68px)]", pathname === "/" ? "" : "px-3 py-4 lg:px-6")}>{children}</main>

      <Dialog open={conversationsOpen} onClose={() => setConversationsOpen(false)} title="最近会话">
        <Button className="mb-4 w-full" onClick={createConversation} loading={creating}><Plus className="size-4" />新建会话</Button>
        <ConversationList items={conversations.items} loading={conversations.loading} error={conversations.error?.userMessage ?? null}
          activeId={activeId} onNavigate={() => setConversationsOpen(false)} onRetry={conversations.refresh} />
      </Dialog>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} meta={meta} />
    </div>
  );
}
