import {
  reloadOnceForStaleClient,
  shouldAutoReloadForServerActionError,
} from "@/lib/stale-client-reload";

export async function runServerAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (shouldAutoReloadForServerActionError(error)) {
      reloadOnceForStaleClient();
      return new Promise(() => {});
    }
    throw error;
  }
}
