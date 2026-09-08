import { api } from "@/lib/api/client";
import type { MessageOut, RequirementCardView, SlotPrimitive } from "@/lib/api/types";

export const conversationApi = {
  create: () => api.post<{ conv_id: string }>("/conversations"),
  getCard: (convId: string) => api.get<RequirementCardView>(`/conversations/${convId}/card`),
  sendMessage: (convId: string, text: string) => api.post<MessageOut>(`/conversations/${convId}/messages`, { text }),
  patchSlot: (convId: string, slot: string, value: SlotPrimitive) =>
    api.patch<RequirementCardView>(`/conversations/${convId}/card`, { slot, value }),
  confirm: (convId: string) => api.post<{ card_id: string; version: number; confirmed_at: string }>(`/conversations/${convId}/card/confirm`),
};
