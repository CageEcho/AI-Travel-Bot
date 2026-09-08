"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SLOT_NAMES, type RequirementCardView, type SlotName } from "@/lib/api/types";
import { SLOT_LABEL, formatSlotValue, percent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { slotBadges } from "../utils";

export function CardPanel({ card, loading, generating, onEdit, onGenerate, className }: {
  card: RequirementCardView | null; loading: boolean; generating: boolean;
  onEdit: (slot: SlotName) => void; onGenerate: () => void; className?: string;
}) {
  const canGenerate = !!card && card.completeness >= card.completeness_threshold;
  const missingLabels = card?.missing_slots.map((m) => SLOT_LABEL[m as SlotName] ?? m).join("、");
  return (
    <Card className={cn("flex flex-col min-h-0", className)}>
      <CardHeader>
        ② 需求卡
        {card && <span className="ml-auto font-normal">v{card.version}{card.confirmed ? " · 已确认（冻结）" : " · 草稿"}</span>}
      </CardHeader>
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading || !card ? (
          <div className="space-y-2" aria-busy="true"><Skeleton className="h-3 w-40" /><Skeleton className="h-2 w-full" />{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted">
                <span>完整度 {percent(card.completeness)}</span><span>阈值 {percent(card.completeness_threshold)}</span>
              </div>
              <div className="h-2 mt-1 rounded bg-border/60 overflow-hidden" role="progressbar" aria-valuenow={Math.round(card.completeness * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="需求卡完整度">
                <div className={cn("h-full", canGenerate ? "bg-primary" : "bg-warning")} style={{ width: percent(card.completeness) }} />
              </div>
            </div>
            {card.conflicts.map((c) => (
              <div key={c.code + c.message} className="mb-2 rounded border-l-[3px] border-danger bg-danger-soft px-3 py-2 text-xs">
                <b>{c.code}</b> {c.message}<br /><span className="text-muted">建议：{c.suggestion}</span>
              </div>
            ))}
            <ul className="divide-y divide-dashed divide-border">
              {SLOT_NAMES.map((name) => {
                const sv = card.slots[name];
                const v = formatSlotValue(sv?.value);
                return (
                  <li key={name} className="grid grid-cols-[88px_1fr_auto] gap-2 items-start py-2 text-sm">
                    <span className="text-muted">{SLOT_LABEL[name]}</span>
                    <button type="button" onClick={() => onEdit(name)} aria-label={`修改${SLOT_LABEL[name]}`}
                      className={cn("text-left inline-flex items-start gap-1 rounded hover:bg-surface-2 -mx-1 px-1 break-all min-h-[28px]", !v && "text-muted/70 italic")}>
                      {v || "（未填）"}<Pencil className="size-3 mt-1 text-muted shrink-0" aria-hidden="true" />
                    </button>
                    <span className="flex flex-wrap gap-1 justify-end">
                      {slotBadges(name, sv, card).map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">
              角标：<Badge tone="success">✓ 客户原话</Badge> <Badge tone="warning">◐ 系统推断</Badge> <Badge tone="info">✎ 顾问填写</Badge> <Badge tone="danger">⚠ 有冲突</Badge> <Badge tone="outline-danger">● 必须确认</Badge>
            </p>
          </>
        )}
      </div>
      <div className="border-t border-border p-3">
        <Button className="w-full" disabled={!canGenerate || generating} loading={generating} onClick={onGenerate}>
          {card?.confirmed ? "重新生成方案" : "确认需求卡并生成方案"}
        </Button>
        <p className="mt-1.5 text-xs text-muted" id="generate-hint">
          {!card ? "" : canGenerate
            ? (card.confirmed ? "需求卡已确认，可再次生成新方案" : "点击后先确认需求卡（人工节点①），再开始生成，约需 30–60 秒")
            : `完整度不足，无法确认。还需补齐：${missingLabels}`}
        </p>
      </div>
    </Card>
  );
}
