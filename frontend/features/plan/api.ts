import { api } from "@/lib/api/client";
import type { PlanStatus, PlanVersionView, TraceResponse } from "@/lib/api/types";

export const planApi = {
  create: (cardId: string) => api.post<{ plan_id: string; task_id: string }>("/plans", { card_id: cardId }),
  status: (planId: string) => api.get<PlanStatus>(`/plans/${planId}/status`),
  version: (planId: string, v: number) => api.get<PlanVersionView>(`/plans/${planId}/versions/${v}`),
  trace: (planId: string) => api.get<TraceResponse>(`/trace/${planId}`),
};
