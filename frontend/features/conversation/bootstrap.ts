const INITIAL_MESSAGE_PREFIX = "xingce:initial-message:";

/** 首页把客户原话交给新会话；sessionStorage 避免把客户信息暴露在 URL 中。 */
export function saveInitialMessage(convId: string, text: string): void {
  window.sessionStorage.setItem(`${INITIAL_MESSAGE_PREFIX}${convId}`, text);
}

/** 只消费一次，避免 React 开发模式重复提交同一段客户原话。 */
export function takeInitialMessage(convId: string): string | null {
  const key = `${INITIAL_MESSAGE_PREFIX}${convId}`;
  const text = window.sessionStorage.getItem(key);
  if (text !== null) window.sessionStorage.removeItem(key);
  return text;
}
