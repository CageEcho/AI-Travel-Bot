"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { isAppError, type AppError } from "@/lib/api/client";
import type { Followup, RequirementCardView, SlotName, SlotPrimitive } from "@/lib/api/types";
import { SLOT_LABEL, formatSlotValue } from "@/lib/utils/format";
import { conversationApi } from "@/features/conversation/api";
import type { ChatMessage } from "@/features/conversation/types";
import { ChatPanel } from "@/features/conversation/components/chat-panel";
import { CardPanel } from "@/features/requirement-card/components/card-panel";
import { SlotEditDialog } from "@/features/requirement-card/components/slot-edit-dialog";
import { optionToSlotValue } from "@/features/requirement-card/utils";
import { usePlanTask } from "@/features/plan/hooks/use-plan-task";
import { PlanPanel, type PlanTab } from "@/features/plan/components/plan-panel";
import { planApi } from "@/features/plan/api";
import { cn } from "@/lib/utils/cn";

type Section = "chat" | "card" | "plan";
const SECTIONS: { value: Section; label: string }[] = [{ value: "chat", label: "对话" }, { value: "card", label: "需求卡" }, { value: "plan", label: "方案" }];
let seq = 0;
const mid = () => `m${Date.now()}-${seq++}`;

export function Workspace({ convId }: { convId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get("plan");
  const tab = (params.get("tab") as PlanTab | null) ?? "plan";

  const [card, setCard] = useState<RequirementCardView | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // 从链接恢复到方案页时给出说明：对话历史不在服务端可读（M0 无消息读取接口）
  const [messages, setMessages] = useState<ChatMessage[]>(() => planId
    ? [{ id: mid(), role: "system", text: "已从链接恢复会话与方案。对话历史暂不回放（后端 M0 未提供消息读取接口），需求卡与方案以服务端为准。" }]
    : []);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [banner, setBanner] = useState<AppError | null>(null);
  const [editing, setEditing] = useState<SlotName | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("chat");
  const generateLock = useRef(false);
  const task = usePlanTask(planId);

  const setQuery = useCallback((patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) q.delete(k); else q.set(k, v); }
    router.replace(`/c/${convId}?${q.toString()}` as never, { scroll: false });
  }, [params, router, convId]);

  useEffect(() => {
    let alive = true;
    conversationApi.getCard(convId)
      .then((c) => { if (!alive) return; setCard(c); setNotFound(false); try { localStorage.setItem("xingce:lastConv", convId); } catch { /* 偏好写入失败不影响业务 */ } })
      .catch((e: unknown) => { if (!alive) return; if (isAppError(e) && e.status === 404) setNotFound(true); else if (isAppError(e)) setBanner(e); })
      .finally(() => { if (alive) setCardLoading(false); });
    return () => { alive = false; };
  }, [convId]);

  const send = useCallback(async (text: string) => {
    setSending(true);
    setBanner(null);
    setMessages((m) => [...m, { id: mid(), role: "advisor", text }]);
    try {
      const out = await conversationApi.sendMessage(convId, text);
      setCard(out.card);
      const fu = out.extraction.followups;
      const extra: ChatMessage[] = fu.length
        ? fu.map((f) => ({ id: mid(), role: "ai" as const, text: f.question, followup: f }))
        : [{ id: mid(), role: "ai", text: "需求已记录，没有需要追问的项。" }];
      const warns: ChatMessage[] = out.warnings.map((w) => ({ id: mid(), role: "system" as const, text: `⚠ ${w}` }));
      setMessages((m) => [...m, ...extra, ...warns]);
      return true;
    } catch (e) {
      const err = isAppError(e) ? e : null;
      setMessages((m) => [...m, { id: mid(), role: "error", text: err?.userMessage ?? "发送失败，请重试。你的输入已保留。" }]);
      if (err) setBanner(err);
      return false;
    } finally { setSending(false); }
  }, [convId]);

  const patch = useCallback(async (slot: SlotName, value: SlotPrimitive) => {
    const c = await conversationApi.patchSlot(convId, slot, value);
    setCard(c);
    return c;
  }, [convId]);

  const answer = useCallback(async (f: Followup, option: string) => {
    const value = optionToSlotValue(f.slot, option);
    setMessages((m) => m.map((x) => (x.followup === f ? { ...x, answered: true } : x)).concat({ id: mid(), role: "advisor", text: `${SLOT_LABEL[f.slot as SlotName] ?? f.slot}：${option}` }));
    try { await patch(f.slot as SlotName, value); }
    catch (e) { if (isAppError(e)) setBanner(e); }
  }, [patch]);

  const saveSlot = useCallback(async (slot: SlotName, value: SlotPrimitive) => {
    setSaving(true); setSaveError(null);
    try {
      await patch(slot, value);
      setEditing(null);
      setMessages((m) => [...m, { id: mid(), role: "system", text: `顾问已将「${SLOT_LABEL[slot]}」改为 ${formatSlotValue(value) || "（清空）"}` }]);
    } catch (e) { setSaveError(isAppError(e) ? e.userMessage : "保存失败"); }
    finally { setSaving(false); }
  }, [patch]);

  const generate = useCallback(async () => {
    if (generateLock.current || !card) return;      // 防重复提交：锁 + 按钮禁用
    generateLock.current = true;
    setGenerating(true); setBanner(null);
    try {
      const conf = await conversationApi.confirm(convId);        // 人工节点①
      setCard((c) => (c ? { ...c, confirmed: true, confirmed_at: conf.confirmed_at } : c));
      const res = await planApi.create(conf.card_id);
      setQuery({ plan: res.plan_id, tab: "plan" });
      setSection("plan");
    } catch (e) { if (isAppError(e)) setBanner(e); }
    finally { setGenerating(false); generateLock.current = false; }
  }, [card, convId, setQuery]);

  const submitting = generating || (planId !== null && task.loading);
  const right = useMemo(() => <span className="font-mono text-[11px]">会话 {convId}</span>, [convId]);

  if (notFound) {
    return (
      <AppShell right={right}>
        <Alert tone="danger">找不到这个会话（{convId}），链接可能已失效。<Link href="/" className="underline ml-1">返回首页新建会话</Link></Alert>
      </AppShell>
    );
  }

  return (
    <AppShell right={right}>
      {banner && <Alert tone="danger" className="mb-3">[{banner.code}] {banner.userMessage}</Alert>}
      <div className="lg:hidden flex gap-1 mb-2 rounded-(--radius-control) bg-surface border border-border p-1" role="tablist" aria-label="工作台区域">
        {SECTIONS.map((s) => (
          <button key={s.value} role="tab" type="button" aria-selected={section === s.value} onClick={() => setSection(s.value)}
            className={cn("flex-1 rounded py-2 text-sm min-h-[44px]", section === s.value ? "bg-primary text-white" : "text-muted")}>{s.label}</button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[380px_400px_1fr] h-[calc(100vh-140px)] lg:h-[calc(100vh-112px)] min-h-[480px]">
        <ChatPanel messages={messages} sending={sending} onSend={send} onAnswer={answer} className={cn(section !== "chat" && "hidden lg:flex")} />
        <CardPanel card={card} loading={cardLoading} generating={submitting} onEdit={(s) => { setSaveError(null); setEditing(s); }} onGenerate={generate}
          className={cn(section !== "card" && "hidden lg:flex")} />
        <PlanPanel task={task} hasPlanId={!!planId} tab={tab} onTab={(t) => setQuery({ tab: t })} onRegenerate={generate}
          canRegenerate={!!card && card.completeness >= card.completeness_threshold} className={cn(section !== "plan" && "hidden lg:flex")} />
      </div>
      <SlotEditDialog slot={editing} current={editing ? card?.slots[editing] : null} saving={saving} error={saveError} onSave={saveSlot} onClose={() => setEditing(null)} />
    </AppShell>
  );
}
