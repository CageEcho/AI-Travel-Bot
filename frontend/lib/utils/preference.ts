"use client";

import { useSyncExternalStore } from "react";

/** 本地偏好（非业务事实）：localStorage + 自定义事件，SSR 首屏用默认值，避免 hydration 不一致与 effect 内 setState。 */
const EVENT = "xingce:preference";

export function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* 私密模式等：忽略 */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function usePreference(key: string): string | null {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); }; },
    () => readPreference(key),
    () => null,
  );
}
