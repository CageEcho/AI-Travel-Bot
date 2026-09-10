import { api } from "@/lib/api/client";
import type { ConversationSummary, CurrentUser, MessageOut, MetaInfo, NextStep, RequirementCardView, SlotPrimitive } from "@/lib/api/types";

export const conversationApi = {
  list: (limit = 50) => api.get<{ items: ConversationSummary[] }>(`/conversations?limit=${limit}`),
  meta: () => api.get<MetaInfo>("/meta"),
  me: () => api.get<CurrentUser>("/meta/me"),
  create: () => api.post<{ conv_id: string }>("/conversations"),
  getCard: (convId: string) => api.get<RequirementCardView>(`/conversations/${convId}/card`),
  sendMessage: (convId: string, text: string) => api.post<MessageOut>(`/conversations/${convId}/messages`, { text }),
  patchSlot: (convId: string, slot: string, value: SlotPrimitive) =>
    api.patch<RequirementCardView>(`/conversations/${convId}/card`, { slot, value }),
  nextStep: (convId: string) => api.post<NextStep>(`/conversations/${convId}/next-step`),
  confirm: (convId: string) => api.post<{ card_id: string; version: number; confirmed_at: string }>(`/conversations/${convId}/card/confirm`),
};
