"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquarePlus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { conversationApi } from "@/features/conversation/api";
import { isAppError } from "@/lib/api/client";

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 用户偏好（最近会话）：客户端安全读取，服务端首屏为 null，避免 hydration 不一致
  const lastConv = useSyncExternalStore(() => () => undefined, () => { try { return localStorage.getItem("xingce:lastConv"); } catch { return null; } }, () => null);

  async function create() {
    if (creating) return;
    setCreating(true); setError(null);
    try { const r = await conversationApi.create(); router.push(`/c/${r.conv_id}` as never); }
    catch (e) { setError(isAppError(e) ? e.userMessage : "创建会话失败"); setCreating(false); }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">把一段客户原话，变成一份可溯源、成本正确的 7 天行程</h1>
          <p className="mt-2 text-muted">粘贴客户需求 → AI 抽取并追问 → 确认需求卡 → 硬过滤检索 + 约束校验 → 方案、成本与待核实清单。</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Card><CardBody className="space-y-3">
            <MessageSquarePlus className="size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">新建会话</h2>
            <p className="text-sm text-muted">开始一位新客户的需求采集。</p>
            <Button onClick={create} loading={creating} className="w-full">新建会话并开始</Button>
            {lastConv && <Link href={`/c/${lastConv}` as never} className="block text-center text-sm text-info underline">继续最近的会话 {lastConv}</Link>}
          </CardBody></Card>
          <Card><CardBody className="space-y-3">
            <Search className="size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">手动检索酒店</h2>
            <p className="text-sm text-muted">不经过 AI，直接按条件硬过滤检索。模型不可用时的降级路径。</p>
            <Link href="/search" className="inline-flex w-full items-center justify-center rounded-(--radius-control) border border-border bg-surface px-4 h-10 text-sm hover:bg-surface-2">打开手动检索</Link>
          </CardBody></Card>
        </div>
      </div>
    </AppShell>
  );
}
