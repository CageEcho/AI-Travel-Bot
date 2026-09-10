import type { ConversationSummary } from "./types";

export type ConvStage = "collecting" | "confirmed" | "generating" | "done" | "failed";

/** 会话列表项的状态：后端字段 → 顾问看得懂的阶段 */
export function conversationStage(c: Pick<ConversationSummary, "completeness" | "confirmed" | "plan_status">): { stage: ConvStage; label: string } {
  const ps = c.plan_status;
  if (ps === "done") return { stage: "done", label: "已生成" };
  if (ps === "failed") return { stage: "failed", label: "生成失败" };
  if (ps) return { stage: "generating", label: "生成中" };
  if (c.confirmed) return { stage: "confirmed", label: "已确认" };
  return { stage: "collecting", label: `采集中 ${Math.round(c.completeness * 100)}%` };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} 天前` : iso.slice(0, 10);
}
