/** 集中式 API 客户端：同源 `/api/v1`，统一错误归一化。页面组件不直接 fetch。 */

export interface AppError {
  code: string;
  message: string;      // 后端原文，用于日志
  userMessage: string;  // 界面展示
  retryable: boolean;
  status?: number;
  details?: Record<string, unknown>;
}

const BASE = "/api/v1";
const RETRYABLE_CODES = new Set(["LLM_FAILED", "LLM_INVALID_OUTPUT", "INTERNAL", "NETWORK", "TIMEOUT"]);

const USER_MESSAGES: Record<string, string> = {
  CARD_NOT_CONFIRMED: "需求卡还没有确认，请先确认需求卡再生成方案。",
  COMPLETENESS_TOO_LOW: "需求卡信息还不够完整，补齐必填项后才能确认。",
  CANDIDATES_TOO_FEW: "按当前条件筛出的酒店太少，暂不生成。请按建议放宽档次、预算或日期。",
  LLM_FAILED: "模型服务暂时不可用，请稍后重试。你输入的内容已保留。",
  LLM_INVALID_OUTPUT: "模型返回的结果不符合约定格式，已自动重试仍失败，请再试一次。",
  CONV_NOT_FOUND: "找不到这个会话，可能链接已失效。",
  PLAN_NOT_FOUND: "找不到这个方案。",
  VERSION_NOT_FOUND: "方案还没有生成完成。",
  NETWORK: "网络连接失败，请检查后端服务是否在运行。",
  TIMEOUT: "请求超时，请重试。",
  INTERNAL: "服务内部错误，请稍后重试。",
};

export function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && "code" in e && "userMessage" in e;
}

export function normalizeError(status: number, body: unknown): AppError {
  const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
  const code = err?.code ?? (status >= 500 ? "INTERNAL" : "HTTP_" + status);
  const message = err?.message ?? `HTTP ${status}`;
  return {
    code,
    message,
    userMessage: USER_MESSAGES[code] ?? message,
    retryable: RETRYABLE_CODES.has(code) || status >= 500,
    status,
    details: err?.details,
  };
}

export function networkError(e: unknown): AppError {
  const timeout = e instanceof DOMException && e.name === "AbortError";
  const code = timeout ? "TIMEOUT" : "NETWORK";
  return { code, message: e instanceof Error ? e.message : String(e), userMessage: USER_MESSAGES[code], retryable: true };
}

export async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch (e) {
    clearTimeout(timer);
    throw networkError(e);
  }
  clearTimeout(timer);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw normalizeError(res.status, body);
  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) => apiFetch<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
};
