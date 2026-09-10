"use client";

import { Info } from "lucide-react";
import type { RenderedItem } from "@/lib/api/types";
import { SLOT_LABEL, shortTime } from "@/lib/utils/format";
import type { SlotName } from "@/lib/api/types";

/** ⓘ 溯源：resource_id / 更新时间 / 命中需求 / 满足约束 / 价格来源 / 事实字段。悬停或聚焦显示。 */
export function ProvenancePopover({ item }: { item: RenderedItem }) {
  const p = item.provenance;
  if (!p) return null;
  const facts = Object.entries(item.facts ?? {}).map(([k, v]) => `${k}=${v === null ? "未记录" : JSON.stringify(v)}`).join("，");
  return (
    <span className="relative inline-block group">
      <button type="button" aria-label={`查看 ${item.name_zh ?? p.resource_id} 的溯源信息`}
        className="inline-flex size-7 items-center justify-center rounded-full text-info hover:bg-info-soft focus:bg-info-soft">
        <Info className="size-4" aria-hidden="true" />
      </button>
      <div role="tooltip" className="hidden group-hover:block group-focus-within:block absolute right-0 top-8 z-20 w-[340px] max-w-[80vw] rounded-2xl bg-ink text-white/90 p-3.5 shadow-(--shadow-float) text-xs leading-5 shadow-xl whitespace-pre-wrap text-left">
        <div>资源 ID：<code>{p.resource_id}</code>{item.room_id && <> · 房型 <code>{item.room_id}</code></>}</div>
        <div>数据更新时间：{shortTime(p.updated_at)}</div>
        <div>命中需求：{p.matched_slots.length ? p.matched_slots.map((s) => SLOT_LABEL[s as SlotName] ?? s).join("、") : "—"}</div>
        <div>满足约束：{p.satisfied_constraints.join(" ") || "—"}</div>
        <div>待核实约束：{p.unknown_constraints.join(" ") || "无"}</div>
        <div>价格来源：{p.price_source ?? "—"}{p.rate_id && ` (${p.rate_id})`}</div>
        <div className="mt-1 text-white/60">事实字段：{facts || "—"}</div>
      </div>
    </span>
  );
}
