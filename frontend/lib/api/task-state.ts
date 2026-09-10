/** 后端 generation_task 状态 → 前端统一任务状态（手册 §9）。未知值不当成功或失败，映射为 stale。 */
import type { PlanStatus } from "./types";

export type UnifiedState =
  | "idle" | "submitting" | "queued" | "running" | "succeeded" | "failed" | "disconnected" | "stale";

export const STAGES = ["searching", "planning", "validating", "costing"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { searching: "检索中", planning: "编排中", validating: "校验中", costing: "核算中" };

export interface TaskView {
  state: UnifiedState;
  stage: Stage | null;
  progress: number;            // 0..1
  replanRound: number;
  version: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  headline: string;            // 现在发生了什么
  action: string;              // 我需要做什么
  next: string;                // 接下来会发生什么
}

export function mapPlanStatus(s: PlanStatus): TaskView {
  const base = { progress: s.progress, replanRound: s.replan_round, version: s.version, errorCode: s.error?.code ?? null, errorMessage: s.error?.message ?? null };
  const st = s.status;
  if (st === "queued") {
    return { ...base, state: "queued", stage: null, headline: "任务已受理，等待开始", action: "无需操作", next: "很快开始检索候选资源" };
  }
  if ((STAGES as readonly string[]).includes(st)) {
    const stage = st as Stage;
    const replan = s.replan_round > 0 ? `（回退重排第 ${s.replan_round} 轮）` : "";
    return {
      ...base, state: "running", stage,
      headline: `${STAGE_LABEL[stage]}${replan}`,
      action: "可以离开页面，任务在服务端继续",
      next: stage === "costing" ? "核算完成后展示完整方案" : "完成后自动进入下一阶段",
    };
  }
  if (st === "done") {
    return { ...base, state: "succeeded", stage: null, headline: "方案已生成", action: "查看行程、成本与待核实清单", next: "确认待核实项后交付客户" };
  }
  if (st === "failed") {
    const orphaned = s.error?.code === "ORPHANED";
    const stalled = s.error?.code === "STALLED";
    return {
      ...base, state: "failed", stage: null,
      headline: orphaned ? "服务重启导致任务中断" : stalled ? "模型长时间无响应，任务已终止" : `生成失败：${s.error?.message ?? "未知原因"}`,
      action: "点击「重新生成」再试一次",
      next: orphaned || stalled ? "需求卡未受影响，重新生成即可" : s.error?.code === "CANDIDATES_TOO_FEW" ? "按提示放宽条件后再生成" : "如果反复失败请联系管理员",
    };
  }
  return { ...base, state: "stale", stage: null, headline: `状态未知（${st}）`, action: "正在重新获取服务端状态", next: "刷新页面可强制同步" };
}

export function isTerminal(state: UnifiedState): boolean {
  return state === "succeeded" || state === "failed";
}
