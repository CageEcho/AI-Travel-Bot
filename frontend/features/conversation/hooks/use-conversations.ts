"use client";

import { useCallback, useEffect, useState } from "react";
import { isAppError, type AppError } from "@/lib/api/client";
import type { ConversationSummary } from "@/lib/api/types";
import { conversationApi } from "../api";

/** 侧栏会话列表：加载 / 空 / 失败三态分离；refreshKey 变化时重新拉取。 */
export function useConversations(refreshKey: string) {
  const [state, setState] = useState<{ items: ConversationSummary[] | null; error: AppError | null }>({ items: null, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    conversationApi.list(40)
      .then((r) => { if (alive) setState({ items: r.items, error: null }); })
      .catch((e: unknown) => { if (alive) setState((s) => ({ items: s.items, error: isAppError(e) ? e : { code: "UNKNOWN", message: String(e), userMessage: "会话列表加载失败", retryable: true } })); });
    return () => { alive = false; };
  }, [refreshKey, nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { items: state.items, error: state.error, loading: state.items === null && !state.error, refresh };
}
