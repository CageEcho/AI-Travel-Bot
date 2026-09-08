"use client";

import { useCallback, useEffect, useState } from "react";
import { isAppError, type AppError } from "@/lib/api/client";
import type { PlanVersionView, TraceResponse } from "@/lib/api/types";
import { isTerminal, mapPlanStatus, type TaskView } from "@/lib/api/task-state";
import { planApi } from "../api";

export interface PlanTask {
  view: TaskView | null;          // 后端状态映射后的视图；null = 尚未拉到
  plan: PlanVersionView | null;
  trace: TraceResponse | null;
  loading: boolean;               // 首次拉取中（区分「加载」与「空」）
  error: AppError | null;         // 拉取失败（非任务失败）
  disconnected: boolean;
  refresh: () => void;
}

interface Snapshot {
  planId: string | null;
  view: TaskView | null;
  plan: PlanVersionView | null;
  trace: TraceResponse | null;
  loading: boolean;
  error: AppError | null;
  disconnected: boolean;
}

const INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 3;
const EMPTY = (planId: string | null): Snapshot => ({ planId, view: null, plan: null, trace: null, loading: !!planId, error: null, disconnected: false });

/** 轮询 generation_task：页面不可见时暂停；完成/失败即停；连续失败 3 次进入 disconnected 并退避。后端是事实来源。 */
export function usePlanTask(planId: string | null): PlanTask {
  const [snap, setSnap] = useState<Snapshot>(() => EMPTY(planId));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!planId) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const patch = (p: Partial<Snapshot>) => { if (!stopped) setSnap((s) => ({ ...(s.planId === planId ? s : EMPTY(planId)), ...p, planId })); };
    const schedule = (ms: number) => { timer = setTimeout(run, ms); };

    async function run() {
      if (stopped) return;
      if (document.visibilityState === "hidden") { schedule(INTERVAL_MS); return; }   // 不可见：只等，不请求
      try {
        const st = await planApi.status(planId!);
        failures = 0;
        const view = mapPlanStatus(st);
        if (view.state === "succeeded") {
          const [plan, trace] = await Promise.all([planApi.version(planId!, view.version ?? 1), planApi.trace(planId!).catch(() => null)]);
          patch({ view, plan, trace, loading: false, error: null, disconnected: false });
        } else {
          patch({ view, loading: false, error: null, disconnected: false });
        }
        if (!isTerminal(view.state)) schedule(view.state === "stale" ? INTERVAL_MS * 2 : INTERVAL_MS);
      } catch (e) {
        const err: AppError = isAppError(e) ? e : { code: "UNKNOWN", message: String(e), userMessage: "获取任务状态失败", retryable: true };
        if (!err.retryable) { patch({ loading: false, error: err }); return; }   // 404 等：停止轮询，显示错误
        failures += 1;
        patch({ loading: false, disconnected: failures >= MAX_CONSECUTIVE_FAILURES });
        schedule(Math.min(INTERVAL_MS * 2 ** Math.min(failures, 4), 30_000));
      }
    }

    run();
    const onVisible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); run(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [planId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  // planId 切换后旧快照视为陈旧：返回空态而不是上一个方案
  const cur = snap.planId === planId ? snap : EMPTY(planId);
  return { view: cur.view, plan: cur.plan, trace: cur.trace, loading: cur.loading, error: cur.error, disconnected: cur.disconnected, refresh };
}
