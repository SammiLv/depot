export const SERVER_ACTION_RELOAD_ONCE_KEY = "depot:server-action-reload";
export const SERVER_ACTION_STALE_MESSAGE_KEY = "depot:server-action-stale-message";

const STALE_SERVER_ACTION_ERROR =
  /Failed to find Server Action|failed-to-find-server-action|Server Reference ID did not match/i;

export function shouldAutoReloadForServerActionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return STALE_SERVER_ACTION_ERROR.test(message);
}

export function clearStaleClientReloadFlag() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SERVER_ACTION_RELOAD_ONCE_KEY);
}

export function reloadOnceForStaleClient() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(SERVER_ACTION_RELOAD_ONCE_KEY)) return;
  sessionStorage.setItem(SERVER_ACTION_RELOAD_ONCE_KEY, "1");
  sessionStorage.setItem(
    SERVER_ACTION_STALE_MESSAGE_KEY,
    "页面版本已更新，刚才的操作未提交成功，请重新点击提交。",
  );
  window.location.reload();
}

export function consumeStaleServerActionMessage() {
  if (typeof window === "undefined") return null;
  const message = sessionStorage.getItem(SERVER_ACTION_STALE_MESSAGE_KEY);
  if (!message) return null;
  sessionStorage.removeItem(SERVER_ACTION_STALE_MESSAGE_KEY);
  return message;
}
