import type { Followup } from "@/lib/api/types";

export type ChatRole = "advisor" | "ai" | "system" | "error";
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** 引导式追问：当前要顾问确认的一个问题（选项 / 多选 / 自由输入） */
  followup?: Followup;
  multi?: boolean;
  answered?: boolean;
  /** 信息齐全：展示摘要与「确认并生成」按钮 */
  ready?: boolean;
}
