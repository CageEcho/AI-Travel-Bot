"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { ChatMessage } from "../types";
import type { Followup } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

const SAMPLE = "张女士一家，两大一小，孩子 5 岁。想 10 月中旬去日本，7 天左右。住好一点的酒店，预算 15 万左右。老人肠胃不好这次不去。";

export function ChatPanel({ messages, sending, onSend, onAnswer, className }: {
  messages: ChatMessage[];
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
  onAnswer: (followup: Followup, option: string) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    const ok = await onSend(t);
    if (ok) setText("");   // 失败时保留输入
  }

  return (
    <Card className={cn("flex flex-col min-h-0", className)}>
      <CardHeader>① 需求采集 · 对话</CardHeader>
      <div
        ref={listRef}
        onScroll={(e) => { const el = e.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="flex-1 min-h-0 overflow-auto p-4 space-y-3"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-muted text-sm">
            粘贴客户原话开始。AI 会抽取需求到右侧需求卡，并提出最多 3 个追问。
            <button type="button" className="text-info underline ml-1" onClick={() => setText(SAMPLE)}>填入示例</button>
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("max-w-[92%] rounded-lg px-3 py-2 whitespace-pre-wrap text-sm",
            m.role === "advisor" && "ml-auto bg-primary-soft",
            m.role === "ai" && "bg-surface-2",
            m.role === "system" && "text-muted text-xs bg-transparent px-0 py-0",
            m.role === "error" && "bg-danger-soft text-danger")}>
            {m.text}
            {m.followup && m.followup.options.length > 0 && !m.answered && (
              <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label={`回答：${m.followup.question}`}>
                {m.followup.options.map((o) => (
                  <button key={o} type="button" onClick={() => onAnswer(m.followup!, o)}
                    className="rounded-full border border-primary text-primary bg-surface px-3 py-1 text-xs hover:bg-primary-soft min-h-[32px]">
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && <div className="text-xs text-muted" role="status">AI 正在抽取需求…</div>}
      </div>
      <form onSubmit={submit} className="border-t border-border p-3 flex gap-2 items-end">
        <label htmlFor="chat-input" className="sr-only">客户原话</label>
        <textarea
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="粘贴客户原话… （⌘/Ctrl + Enter 发送）"
          rows={3}
          disabled={sending}
          className="flex-1 resize-none rounded-(--radius-control) border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
        />
        <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="发送">
          <SendHorizonal className="size-4" aria-hidden="true" />
          发送
        </Button>
      </form>
    </Card>
  );
}
