"use client";

import { useEffect } from "react";
import { clearStaleClientReloadFlag } from "@/lib/stale-client-reload";

const POLL_INTERVAL_MS = 60_000;

async function fetchBuildId(): Promise<string | null> {
  const response = await fetch("/api/build-id", { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { buildId?: string };
  return data.buildId ?? null;
}

export function DeploymentSync() {
  useEffect(() => {
    clearStaleClientReloadFlag();

    let initialBuildId: string | null = null;
    let reloading = false;

    async function check() {
      if (reloading) return;
      const current = await fetchBuildId();
      if (!current) return;
      if (initialBuildId === null) {
        initialBuildId = current;
        return;
      }
      if (current !== initialBuildId) {
        reloading = true;
        window.location.reload();
      }
    }

    void check();
    const timer = window.setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return null;
}
