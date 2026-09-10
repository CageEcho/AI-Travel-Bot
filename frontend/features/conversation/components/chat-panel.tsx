"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizonal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { ChatMessage } from "../types";
import type { Followup } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

const SAMPLE = "张女士一家，两大一小，孩子 5 岁。想 10 月中旬去日本，7 天左右。住好一点的酒店，预算 15 万左右。老人肠胃不好这次不去。";

export function ChatPanel({ messages, sending, thinking, onSend, onAnswer, onSkip, onGenerate, generating, notice, onFixCard, className }: {
  messages: ChatMessage[];
  sending: boolean;
  thinking: boolean;                       // 正在分析下一步
  onSend: (text: string) => Promise<boolean>;
  onAnswer: (followup: Followup, value: string | string[]) => void;
  onSkip: (followup: Followup) => void;
  onGenerate: () => void;
  generating: boolean;
  /** 派生自任务状态的提示（如生成失败需回头改需求卡），不入消息列表 */
  notice?: string | null;
  onFixCard?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    const ok = await onSend(t);
    if (ok) setText("");   // 失败时保留输入
  }

  return (
    <Card className={cn("flex flex-col min-h-0", className)}>
      <CardHeader>① 需求采集 · 多轮引导</CardHeader>
      <div
        ref={listRef}
        onScroll={(e) => { const el = e.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="flex-1 min-h-0 overflow-auto p-4 space-y-3"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-muted text-sm">
            粘贴客户原话开始。AI 会分析需求、填写右侧需求卡，并逐个给出下一步需要向客户确认的问题。
            <button type="button" className="text-info underline ml-1" onClick={() => setText(SAMPLE)}>填入示例</button>
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("max-w-[94%] px-3.5 py-2.5 whitespace-pre-wrap text-sm rounded-2xl",
            m.role === "advisor" && "ml-auto bg-primary text-white rounded-br-md",
            m.role === "ai" && "bg-surface-2 rounded-bl-md",
            m.role === "system" && "text-muted text-xs bg-transparent px-0 py-0",
            m.role === "error" && "bg-danger-soft text-danger")}>
            {m.role === "ai" && m.text && (m.followup || m.ready) && (
              <div className="flex items-center gap-1 text-[11px] text-muted mb-1"><Sparkles className="size-3" aria-hidden="true" />AI 分析</div>
            )}
            {m.text}
            {m.followup && !m.answered && (
              <GuideQuestion followup={m.followup} multi={!!m.multi} onAnswer={(v) => onAnswer(m.followup!, v)} onSkip={() => onSkip(m.followup!)} />
            )}
            {m.ready && (
              <div className="mt-2">
                <Button size="sm" onClick={onGenerate} loading={generating}>确认需求卡并生成方案</Button>
              </div>
            )}
          </div>
        ))}
        {notice && (
          <div role="alert" className="max-w-[94%] rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger whitespace-pre-wrap">
            {notice}
            {onFixCard && <div className="mt-2"><Button size="sm" onClick={onFixCard}>回到需求卡修改</Button></div>}
          </div>
        )}
        {sending && <div className="text-xs text-muted" role="status">AI 正在抽取需求…</div>}
        {thinking && <div className="text-xs text-muted" role="status">AI 正在分析下一步要确认什么…</div>}
      </div>
      <form onSubmit={submit} className="p-3 flex gap-2 items-end">
        <label htmlFor="chat-input" className="sr-only">客户原话</label>
        <textarea
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="粘贴客户原话或补充说明… （⌘/Ctrl + Enter 发送）"
          rows={3}
          disabled={sending}
          className="control flex-1 resize-none text-sm"
        />
        <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="发送">
          <SendHorizonal className="size-4" aria-hidden="true" />
          发送
        </Button>
      </form>
    </Card>
  );
}

/** 一个引导问题：单选按钮 / 多选芯片 + 确定 / 无选项时自由输入。都可「先跳过」。 */
function GuideQuestion({ followup, multi, onAnswer, onSkip }: { followup: Followup; multi: boolean; onAnswer: (v: string | string[]) => void; onSkip: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [free, setFree] = useState("");
  const hasOptions = followup.options.length > 0;
  return (
    <div className="mt-2 space-y-2" role="group" aria-label={`回答：${followup.question}`}>
      <p className="font-medium">{followup.question}</p>
      {hasOptions && (
        <div className="flex flex-wrap gap-1.5">
          {followup.options.map((o) => {
            const on = picked.includes(o);
            return (
              <button key={o} type="button" aria-pressed={multi ? on : undefined}
                onClick={() => multi ? setPicked(on ? picked.filter((x) => x !== o) : [...picked, o]) : onAnswer(o)}
                className={cn("rounded-full px-3.5 py-1 text-[12px] font-semibold min-h-[32px] transition-colors shadow-(--shadow-card)",
                  on ? "bg-primary text-white" : "bg-surface text-text hover:bg-primary-soft")}>
                {o}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(!hasOptions || multi) && (
          <>
            {!hasOptions && (
              <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="输入后按确定"
                onKeyDown={(e) => { if (e.key === "Enter" && free.trim()) { e.preventDefault(); onAnswer(free.trim()); } }}
                className="control text-xs min-h-[32px]! py-1! w-48" aria-label={followup.question} />
            )}
            {hasOptions && multi && (
              <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="其它（可选）"
                className="control text-xs min-h-[32px]! py-1! w-32" aria-label="其它选项" />
            )}
            <Button size="sm" disabled={!picked.length && !free.trim()}
              onClick={() => onAnswer(multi ? [...picked, ...(free.trim() ? [free.trim()] : [])] : free.trim())}>确定</Button>
          </>
        )}
        <button type="button" onClick={onSkip} className="text-xs text-muted underline min-h-[32px]">先跳过</button>
      </div>
    </div>
  );
}
