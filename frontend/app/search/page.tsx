"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { searchApi, type HotelQueryInput } from "@/features/search/api";
import { isAppError } from "@/lib/api/client";
import type { SearchResult } from "@/lib/api/types";
import { labelOf, money } from "@/lib/utils/format";

const TIERS = ["4star", "5star", "luxury", "ryokan", "boutique"];
const FUNNEL_LABEL: Record<string, string> = { city_active: "城市在售", tier: "档次", availability_h8: "可售期 H8", capacity_h1: "容量 H1" };

export default function SearchPage() {
  const [q, setQ] = useState<HotelQueryInput>({ city: "京都", checkin: "2026-10-15", checkout: "2026-10-18", adults: 2, children: 1, child_ages: "5", tiers: ["5star", "luxury"], max_price_per_night: "" });
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading"); setError(null);
    try { setResult(await searchApi.hotels(q)); setState("done"); }
    catch (err) { setError(isAppError(err) ? err.userMessage : "检索失败"); setState("failed"); }
  }
  const field = "control text-sm";

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>手动检索 · 硬过滤条件</CardHeader>
          <CardBody>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-xs text-muted">城市
                <select className={field} value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value })}>{["东京", "京都", "箱根"].map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted">入住<input type="date" className={field} value={q.checkin} onChange={(e) => setQ({ ...q, checkin: e.target.value })} required /></label>
                <label className="block text-xs text-muted">退房<input type="date" className={field} value={q.checkout} onChange={(e) => setQ({ ...q, checkout: e.target.value })} required /></label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs text-muted">成人<input type="number" min={1} className={field} value={q.adults} onChange={(e) => setQ({ ...q, adults: Number(e.target.value) })} /></label>
                <label className="block text-xs text-muted">儿童<input type="number" min={0} className={field} value={q.children} onChange={(e) => setQ({ ...q, children: Number(e.target.value) })} /></label>
                <label className="block text-xs text-muted">儿童年龄<input className={field} placeholder="5, 8" value={q.child_ages} onChange={(e) => setQ({ ...q, child_ages: e.target.value })} /></label>
              </div>
              <fieldset><legend className="text-xs text-muted mb-1">档次（不选 = 全部）</legend>
                <div className="flex flex-wrap gap-1.5">{TIERS.map((t) => (
                  <label key={t} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[#eef1f5] has-checked:bg-primary-soft has-checked:text-primary has-checked:font-semibold transition-colors">
                    <input type="checkbox" checked={q.tiers.includes(t)} onChange={(e) => setQ({ ...q, tiers: e.target.checked ? [...q.tiers, t] : q.tiers.filter((x) => x !== t) })} />{labelOf(t)}
                  </label>))}</div>
              </fieldset>
              <label className="block text-xs text-muted">每晚价格上限（JPY，可空）<input type="number" min={0} className={field} value={q.max_price_per_night} onChange={(e) => setQ({ ...q, max_price_per_night: e.target.value })} /></label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <Button type="submit" loading={state === "loading"} className="w-full">检索酒店</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>检索结果</CardHeader>
          <CardBody>
            {state === "idle" && <p className="text-sm text-muted">设置条件后检索。过滤掉的资源不会出现在结果里（硬过滤），无结果时给出放宽建议。</p>}
            {state === "loading" && <div className="space-y-2" aria-busy="true"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>}
            {state === "done" && result && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">{Object.entries(result.funnel).map(([k, v]) => <Badge key={k} tone="neutral">{FUNNEL_LABEL[k] ?? k} {v}</Badge>)}</div>
                {!result.cost_visible && <Alert tone="warning">当前账号可查看匹配结果，但净价、价格档和加价信息已由后端过滤。</Alert>}
                {result.candidates.length === 0 ? (
                  <Alert tone="warning">
                    <b>没有满足全部硬条件的酒店。</b>
                    <ul className="mt-1 list-disc pl-4">{result.relaxation_hints.map((h, i) => <li key={i}>{h.suggestion}</li>)}</ul>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead><tr className="text-xs text-muted text-left"><th className="py-1.5 pr-2">酒店 / 房型</th><th className="px-2">档次</th><th className="px-2">容量</th><th className="px-2">最低入住年龄</th>{result.cost_visible && <><th className="px-2 text-right">净价 / 晚</th><th className="px-2">价格来源</th></>}</tr></thead>
                      <tbody>{result.candidates.map((c, index) => (
                        <tr key={c.rate_id ?? `${c.hotel_id}-${c.room_id}-${index}`} className="border-t border-border align-top">
                          <td className="py-2"><b>{c.name_zh}</b> <span className="text-xs text-muted">{c.name_local}</span><div className="text-xs">{c.room_name} · <code>{c.hotel_id}</code></div></td>
                          <td className="px-2">{labelOf(c.tier)}</td><td className="px-2">{c.max_occupancy} 人</td>
                          <td className="px-2">{c.min_child_age === null ? <Badge tone="warning">未记录</Badge> : `${c.min_child_age} 岁`}</td>
                          {result.cost_visible && <><td className="px-2 text-right tabular-nums">¥{money(c.net_price ?? 0, 0)}{Number(c.season_uplift) > 0 && <div className="text-xs text-muted">旺季 +{Math.round(Number(c.season_uplift) * 100)}%</div>}</td>
                          <td className="px-2"><Badge tone={c.confidence === "contracted" ? "success" : "warning"}>{c.confidence}</Badge></td></>}
                        </tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
