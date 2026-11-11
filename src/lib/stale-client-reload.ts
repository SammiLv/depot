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

const CLIENT_BUILD_ID_KEY = "depot:client-build-id";

/** 若页面加载时的 BUILD_ID 与服务端当前不一致，先刷新再提交，避免 Server Action 丢失 */
export async function ensureClientBuildBeforeServerAction() {
  if (typeof window === "undefined") return;
  const pageBuildId = document.body.dataset.buildId?.trim() || "";
  if (!pageBuildId) return;
  const response = await fetch("/api/build-id", { cache: "no-store" });
  if (!response.ok) return;
  const data = (await response.json()) as { buildId?: string };
  const serverBuildId = data.buildId?.trim() || "";
  if (!serverBuildId || serverBuildId === pageBuildId) {
    sessionStorage.setItem(CLIENT_BUILD_ID_KEY, serverBuildId || pageBuildId);
    return;
  }
  sessionStorage.setItem(
    SERVER_ACTION_STALE_MESSAGE_KEY,
    "服务已发布新版本，页面将自动刷新，请再次点击审核通过。",
  );
  sessionStorage.setItem(CLIENT_BUILD_ID_KEY, serverBuildId);
  window.location.reload();
  await new Promise(() => {});
}
