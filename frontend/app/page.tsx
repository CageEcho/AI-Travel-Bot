"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, CarFront, FileCheck2, HeartPulse, Hotel, MapPin, Sparkles, TicketCheck, UsersRound, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { conversationApi } from "@/features/conversation/api";
import { AUTO_REQUEST } from "@/features/conversation/auto-request";
import { saveInitialMessage } from "@/features/conversation/bootstrap";
import { isAppError } from "@/lib/api/client";
import { useRouter } from "next/navigation";

const STRUCTURED_TEMPLATE = "出行人：\n目的地：\n预计日期与天数：\n预算：\n酒店偏好：\n特别需求：";

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [requestText, setRequestText] = useState("");
  const [emptyHint, setEmptyHint] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const text = requestText.trim();
    if (!text) {
      setEmptyHint(true);
      inputRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await conversationApi.create();
      saveInitialMessage(result.conv_id, text);
      router.push(`/c/${result.conv_id}` as never);
    } catch (e) {
      setError(isAppError(e) ? e.userMessage : "创建会话失败");
      setCreating(false);
    }
  }

  function fill(value: string) {
    setRequestText(value);
    setEmptyHint(false);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <Image src="/images/hero.webp" alt="Beyond Dream Travel 定制旅程" fill priority sizes="100vw" className="object-cover grayscale" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,7,8,.91)_0%,rgba(5,8,9,.72)_52%,rgba(4,7,8,.36)_100%)]" aria-hidden="true" />
        <div className="site-container relative z-10 py-10 sm:py-12 lg:py-14">
          <div className="mx-auto max-w-[980px] text-center text-white">
            <h1 className="text-[clamp(30px,3.15vw,46px)] font-bold leading-[1.15] tracking-[-0.035em] lg:whitespace-nowrap">把客户原话，变成可交付的定制行程</h1>
            <p className="mt-3 text-[13px] leading-6 text-white/78 sm:text-[15px]">从需求理解到方案生成、在地资源匹配、并行比选与报价，帮助你更快更准确地响应高端定制需求。</p>
          </div>

          <form onSubmit={analyze} className="home-request-panel mt-7">
            <label htmlFor="customer-request" className="block text-[15px] font-bold text-[#14191f]">告诉我们需求</label>
            <div className="relative mt-2">
              {!requestText && (
                <div id="customer-request-example" className="pointer-events-none absolute left-4 right-20 top-3 z-10 text-[14px] leading-6">
                  <span className="text-[#929ba8]">例如：</span>
                  <button type="button" onClick={() => fill(AUTO_REQUEST)} className="pointer-events-auto ml-1 text-left font-medium text-[#3d5f91] underline decoration-[#9bacc4] underline-offset-4 transition hover:text-[#24466f]">
                    一家三口十月去日本，偏好亲子、自然，想住得好一点……
                  </button>
                </div>
              )}
              <textarea ref={inputRef} id="customer-request" value={requestText} maxLength={2000} rows={3}
                onChange={(event) => { setRequestText(event.target.value); setEmptyHint(false); if (error) setError(null); }}
                aria-describedby="customer-request-example customer-request-hint"
                className="min-h-[108px] w-full resize-y rounded-lg border border-[#dce2ea] bg-[#f7f9fc] px-4 py-3 pr-20 text-[14px] leading-6 text-text outline-none transition focus:border-[#54d66d] focus:bg-white focus:ring-4 focus:ring-[#54d66d]/12" />
              <span className="absolute bottom-3 right-4 text-[12px] tabular-nums text-[#8792a3]">{requestText.length} / 2000</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={creating} className="home-primary-action">
                {creating ? "正在创建…" : "AI 为我生成方案"}<span aria-hidden="true">→</span>
              </button>
              <button type="button" disabled title="内测阶段即将开放" className="home-secondary-action">真人咨询</button>
              <button type="button" onClick={() => fill(STRUCTURED_TEMPLATE)} className="home-text-action">如何写更清晰</button>
            </div>
            <p id="customer-request-hint" className={`mt-2 text-[11px] ${emptyHint ? "font-semibold text-[#3d5f91]" : "text-[#8792a3]"}`}>
              {emptyHint ? "请先填写客户需求，或点击输入框中的蓝色示例快速填入。" : "点击蓝色示例可填入完整演示需求，确认内容后再生成。"}
            </p>
            {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
          </form>
        </div>
      </section>

      <section className="bg-[#f7f8fa] px-4 py-7 sm:px-6 lg:py-8" aria-label="方案生成流程">
        <div className="site-container overflow-hidden rounded-xl border border-[#e4e8ee] bg-white shadow-[0_8px_28px_rgba(26,36,51,.035)]">
          <div className="grid lg:grid-cols-4">
            <WorkflowStep number="01" title="理解需求">
              <h3 className="workflow-subtitle">原话示例</h3>
              <div className="flex gap-3 rounded-lg bg-[#f5f7fa] p-3 text-[12px] leading-5 text-[#667085]">
                <UsersRound className="mt-0.5 size-5 shrink-0 text-[#1f2937]" />
                <span>我们一家三口 7 月去北海道，想要自然风光、偏好亲子体验……</span>
              </div>
              <div className="mt-4 flex gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f2]"><Sparkles className="size-[18px] text-[#37bd58]" /></span>
                <div><h3 className="workflow-subtitle">AI 理解的关键点</h3><p className="text-[12px] leading-5 text-[#667085]">家庭出行 · 7 月 · 自然 · 亲子……</p></div>
              </div>
            </WorkflowStep>

            <WorkflowStep number="02" title="资源匹配">
              <h3 className="workflow-subtitle">推荐</h3>
              <ResourceRow icon={CalendarDays} label="航班" value="北京 → 札幌 · 7 月 12 日" />
              <ResourceRow icon={Hotel} label="住宿" value="星野度假村 · 2 晚" />
              <ResourceRow icon={MapPin} label="体验" value="富良野花田 · 亲子农场" />
              <ResourceRow icon={CarFront} label="租车" value="7 座商务车" />
              <ResourceRow icon={HeartPulse} label="保险" value="旅行意外险" />
              <ResourceRow icon={TicketCheck} label="其他" value="签证支持 · 中文客服" />
            </WorkflowStep>

            <WorkflowStep number="03" title="生成方案">
              <h3 className="workflow-subtitle">行程预览</h3>
              <div className="grid grid-cols-[104px_1fr] gap-3">
                <div className="relative h-[144px] overflow-hidden rounded-lg"><Image src="/images/hero.webp" alt="北海道自然旅程示意" fill sizes="104px" className="object-cover" /></div>
                <div className="min-w-0 text-[12px] leading-5 text-[#667085]">
                  <b className="block text-[13px] text-[#151a20]">北海道亲子自然之旅</b>
                  <p>7 天 6 晚 · 家庭定制</p><p>札幌 · 富良野 · 美瑛</p><p>特色住宿 2 晚</p><p>亲子体验 4 项</p><p>专属用车 · 中文服务</p>
                </div>
              </div>
            </WorkflowStep>

            <WorkflowStep number="04" title="确认交付">
              <h3 className="workflow-subtitle">你将收到的内容</h3>
              <Deliverable>完整行程单（含报价）</Deliverable>
              <Deliverable>资源明细与可选方案</Deliverable>
              <Deliverable>成本拆解表</Deliverable>
              <Deliverable>预订链接与供应商信息</Deliverable>
              <Deliverable>出行须知与风险提示</Deliverable>
            </WorkflowStep>
          </div>
        </div>
        <div className="site-container mt-4 flex items-center justify-between text-[11px] text-[#8a93a1]">
          <span>资源数据为模拟数据集，当前用于产品内测。</span>
          <Link href="/search" className="font-semibold text-[#52647d] hover:text-[#1f2937]">进入手动检索 →</Link>
        </div>
      </section>
    </div>
  );
}

function WorkflowStep({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <article className="min-w-0 border-b border-[#e7ebf0] p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <header className="mb-4 flex items-center gap-3 border-b border-[#e7ebf0] pb-3">
        <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-lg bg-[#f0f3f7] px-2 text-[13px] font-bold text-[#253044]">{number}</span>
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-[#171c22]">{title}</h2>
      </header>
      {children}
    </article>
  );
}

function ResourceRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="grid grid-cols-[18px_42px_1fr] items-start gap-2 py-1 text-[12px] leading-5 text-[#667085]"><Icon className="mt-0.5 size-4 text-[#334155]" /><span>{label}</span><span>{value}</span></div>;
}

function Deliverable({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 py-1 text-[12px] leading-5 text-[#667085]"><FileCheck2 className="mt-0.5 size-4 shrink-0 text-[#334155]" /><span>{children}</span></div>;
}
