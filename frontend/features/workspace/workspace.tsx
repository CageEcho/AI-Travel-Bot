"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { isAppError, type AppError } from "@/lib/api/client";
import type { Followup, NextStep, RequirementCardView, SlotName, SlotPrimitive } from "@/lib/api/types";
import { SLOT_LABEL, formatSlotValue } from "@/lib/utils/format";
import { conversationApi } from "@/features/conversation/api";
import { takeInitialMessage } from "@/features/conversation/bootstrap";
import type { ChatMessage } from "@/features/conversation/types";
import { ChatPanel } from "@/features/conversation/components/chat-panel";
import { CardPanel } from "@/features/requirement-card/components/card-panel";
import { SlotEditDialog } from "@/features/requirement-card/components/slot-edit-dialog";
import { MUST_ASK, SLOT_KIND } from "@/features/requirement-card/utils";
import { usePlanTask } from "@/features/plan/hooks/use-plan-task";
import { PlanPanel, type PlanTab } from "@/features/plan/components/plan-panel";
import { planApi } from "@/features/plan/api";
import { cn } from "@/lib/utils/cn";
import { needsCardFix, problemSlotsFor } from "@/lib/api/problem-slots";
import { isTerminal } from "@/lib/api/task-state";

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
  const [thinking, setThinking] = useState(false);
  const queue = useRef<Followup[]>([]);          // 本轮待问的问题（一次只展示第一个）
  const [generating, setGenerating] = useState(false);
  const [banner, setBanner] = useState<AppError | null>(null);
  const [editing, setEditing] = useState<SlotName | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("chat");
  const [highlight, setHighlight] = useState<SlotName[]>([]);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const isMulti = (slot: string) => SLOT_KIND[slot as SlotName] === "multiEnum" || SLOT_KIND[slot as SlotName] === "list";

  /** 展示一轮引导：分析 + 第一个问题；信息齐全时展示摘要与生成按钮 */
  const pushGuide = useCallback((step: NextStep) => {
    if (step.ready) {
      queue.current = [];
      setMessages((m) => [...m, { id: mid(), role: "ai", text: `${step.analysis}\n\n需求摘要：${step.summary}`, ready: true }]);
      return;
    }
    queue.current = step.followups;
    const first = step.followups[0];
    setMessages((m) => [...m, { id: mid(), role: "ai", text: step.analysis, followup: first, multi: first ? isMulti(first.slot) : false }]);
  }, []);

  /** 向服务端要下一步（AI 分析当前需求卡） */
  const fetchNext = useCallback(async () => {
    setThinking(true);
    try { pushGuide(await conversationApi.nextStep(convId)); }
    catch (e) { if (isAppError(e)) setMessages((m) => [...m, { id: mid(), role: "error", text: `无法获取下一步：${e.userMessage}` }]); }
    finally { setThinking(false); }
  }, [convId, pushGuide]);

  /** 当前问题处理完：还有排队的问题就直接问下一个，否则请 AI 重新分析 */
  const advance = useCallback(async (done: Followup) => {
    const rest = queue.current.filter((q) => q.slot !== done.slot);
    queue.current = rest;
    if (rest.length) {
      const next = rest[0];
      setMessages((m) => [...m, { id: mid(), role: "ai", text: "", followup: next, multi: isMulti(next.slot) }]);
    } else {
      await fetchNext();
    }
  }, [fetchNext]);

  const send = useCallback(async (text: string) => {
    setSending(true);
    setBanner(null);
    setMessages((m) => [...m.map((x) => (x.followup && !x.answered ? { ...x, answered: true } : x)), { id: mid(), role: "advisor", text }]);
    try {
      const out = await conversationApi.sendMessage(convId, text);
      setCard(out.card);
      if (out.warnings.length) console.debug("[extract warnings]", out.warnings);   // 内部质量提示不打扰顾问
      if (out.next_step) pushGuide(out.next_step);
      else setMessages((m) => [...m, { id: mid(), role: "ai", text: "需求已记录。" }]);
      return true;
    } catch (e) {
      const err = isAppError(e) ? e : null;
      setMessages((m) => [...m, { id: mid(), role: "error", text: err?.userMessage ?? "发送失败，请重试。你的输入已保留。" }]);
      if (err) setBanner(err);
      return false;
    } finally { setSending(false); }
  }, [convId, pushGuide]);

  // 从首页进入新会话时，自动提交刚粘贴的客户原话。先等需求卡首轮读取完成，避免空卡响应覆盖抽取结果。
  useEffect(() => {
    if (cardLoading || notFound) return;
    const initialMessage = takeInitialMessage(convId);
    if (initialMessage) void send(initialMessage);
  }, [cardLoading, convId, notFound, send]);

  const patch = useCallback(async (slot: SlotName, value: SlotPrimitive) => {
    const c = await conversationApi.patchSlot(convId, slot, value);
    setCard(c);
    return c;
  }, [convId]);

  const answer = useCallback(async (f: Followup, value: string | string[]) => {
    const shown = Array.isArray(value) ? value.join("、") : value;
    setMessages((m) => m.map((x) => (x.followup === f ? { ...x, answered: true } : x)).concat({ id: mid(), role: "advisor", text: `${SLOT_LABEL[f.slot as SlotName] ?? f.slot}：${shown}` }));
    try {
      await patch(f.slot as SlotName, value);     // 服务端负责把「两人总计」这类原文归一化为规范值，不合法会报 VALUE_INVALID
      await advance(f);
    } catch (e) {
      const msg = isAppError(e) ? e.userMessage : "保存失败";
      // 让这个问题重新可答
      setMessages((m) => [...m.map((x) => (x.followup === f ? { ...x, answered: false } : x)), { id: mid(), role: "error", text: `没有记录：${msg}。请换一个选项或直接输入。` }]);
    }
  }, [patch, advance]);

  const skip = useCallback(async (f: Followup) => {
    setMessages((m) => m.map((x) => (x.followup === f ? { ...x, answered: true } : x)).concat({ id: mid(), role: "system", text: `已跳过「${SLOT_LABEL[f.slot as SlotName] ?? f.slot}」，稍后可在需求卡里补` }));
    await advance(f);
  }, [advance]);

  const saveSlot = useCallback(async (slot: SlotName, value: SlotPrimitive) => {
    setSaving(true); setSaveError(null);
    try {
      await patch(slot, value);
      setEditing(null);
      setMessages((m) => [...m, { id: mid(), role: "system", text: `顾问已将「${SLOT_LABEL[slot]}」改为 ${formatSlotValue(value) || "（清空）"}` }]);
      const cur = queue.current[0];
      if (cur && cur.slot === slot) {
        setMessages((m) => m.map((x) => (x.followup === cur ? { ...x, answered: true } : x)));
        await advance(cur);
      }
    } catch (e) { setSaveError(isAppError(e) ? e.userMessage : "保存失败"); }
    finally { setSaving(false); }
  }, [patch, advance]);

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

  /** 生成失败 / 有冲突时需要回头改的槽位（派生，不存状态） */
  const problemSlots = useMemo(
    () => problemSlotsFor(task.view?.state === "failed" ? task.view.errorCode : null, task.view?.errorMessage ?? null, card?.conflicts ?? []),
    [task.view, card?.conflicts]);

  /** 回到需求卡：切区域、滚动到第一个问题槽位、高亮 4 秒、直接打开编辑框 */
  const fixCard = useCallback(() => {
    const slots = problemSlots.length ? problemSlots : (["hotel_tier"] as SlotName[]);
    setSection("card");
    setHighlight(slots);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight([]), 4000);
    requestAnimationFrame(() => {
      document.getElementById(`slot-${slots[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setSaveError(null);
      setEditing(slots[0]);
    });
  }, [problemSlots]);

  const failedNotice = task.view?.state === "failed" && needsCardFix(task.view.errorCode)
    ? `生成失败：${task.view.errorMessage ?? ""}\n需要修改：${problemSlots.map((s) => SLOT_LABEL[s]).join("、")}`
    : null;

  // 提交态：确认/创建请求进行中，或任务仍在服务端运行（queued/running）——此时「重新生成」无意义，按钮保持禁用，天然防连点
  const taskRunning = !!task.view && !isTerminal(task.view.state);
  const submitting = generating || (planId !== null && task.loading) || taskRunning;

  if (notFound) {
    return (
      <>
        <Alert tone="danger">找不到这个会话（{convId}），链接可能已失效。<Link href="/" className="underline ml-1">返回首页新建会话</Link></Alert>
      </>
    );
  }

  return (
    <>
      {banner && <Alert tone="danger" className="mb-3">[{banner.code}] {banner.userMessage}</Alert>}
      <div className="lg:hidden flex gap-1 mb-2 bg-surface-2 rounded-full p-1" role="tablist" aria-label="工作台区域">
        {SECTIONS.map((s) => (
          <button key={s.value} role="tab" type="button" aria-selected={section === s.value} onClick={() => setSection(s.value)}
            className={cn("flex-1 py-2 text-[12.5px] font-semibold rounded-full min-h-[44px] transition-all", section === s.value ? "bg-surface text-text shadow-(--shadow-card)" : "text-muted")}>{s.label}</button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[380px_400px_1fr] h-[calc(100vh-140px)] lg:h-[calc(100vh-112px)] min-h-[480px]">
        <ChatPanel messages={messages} sending={sending} thinking={thinking} onSend={send} onAnswer={answer} onSkip={skip}
          onGenerate={generate} generating={submitting} notice={failedNotice} onFixCard={fixCard} className={cn(section !== "chat" && "hidden lg:flex")} />
        <CardPanel card={card} loading={cardLoading} generating={submitting} onEdit={(s) => { setSaveError(null); setEditing(s); }} onGenerate={generate}
          highlight={highlight} className={cn(section !== "card" && "hidden lg:flex")} />
        <PlanPanel task={task} card={card} hasPlanId={!!planId} tab={tab} onTab={(t) => setQuery({ tab: t })} onRegenerate={generate} onFixCard={fixCard}
          canRegenerate={!!card && card.completeness >= card.completeness_threshold && card.conflicts.length === 0
            && !card.missing_slots.some((name) => MUST_ASK.includes(name as SlotName))} className={cn(section !== "plan" && "hidden lg:flex")} />
      </div>
      <SlotEditDialog slot={editing} current={editing ? card?.slots[editing] : null} saving={saving} error={saveError} onSave={saveSlot} onClose={() => setEditing(null)} />
    </>
  );
}
