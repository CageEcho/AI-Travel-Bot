import { describe, expect, it } from "vitest";
import { networkError, normalizeError } from "@/lib/api/client";

describe("normalizeError", () => {
  it("后端统一错误结构 → AppError，409 不可重试且有用户文案", () => {
    const e = normalizeError(409, { error: { code: "CARD_NOT_CONFIRMED", message: "需求卡尚未确认，无法生成方案" } });
    expect(e.code).toBe("CARD_NOT_CONFIRMED");
    expect(e.retryable).toBe(false);
    expect(e.userMessage).toContain("确认需求卡");
  });
  it("LLM_FAILED 可重试，且不透出堆栈", () => {
    const e = normalizeError(502, { error: { code: "LLM_FAILED", message: "模型服务返回错误（HTTP 400）" } });
    expect(e.retryable).toBe(true);
    expect(e.userMessage).not.toContain("Traceback");
  });
  it("无结构错误体按状态码兜底", () => {
    const e = normalizeError(500, null);
    expect(e.code).toBe("INTERNAL");
    expect(e.retryable).toBe(true);
  });
  it("details 透传（完整度不足的缺失项）", () => {
    const e = normalizeError(409, { error: { code: "COMPLETENESS_TOO_LOW", message: "x", details: { missing: ["dietary"] } } });
    expect(e.details?.missing).toEqual(["dietary"]);
  });
  it("网络错误可重试", () => {
    expect(networkError(new TypeError("fetch failed")).retryable).toBe(true);
  });
});
