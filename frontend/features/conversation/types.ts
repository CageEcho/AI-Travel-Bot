import type { Followup } from "@/lib/api/types";

export type ChatRole = "advisor" | "ai" | "system" | "error";
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  followup?: Followup;   // ai 追问附带选项
  answered?: boolean;
}
