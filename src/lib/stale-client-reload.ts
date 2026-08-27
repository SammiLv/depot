export const SERVER_ACTION_RELOAD_ONCE_KEY = "depot:server-action-reload";

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
  window.location.reload();
}
