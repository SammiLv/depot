"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LogOut, Sparkles } from "lucide-react";
import { logout } from "@/server/auth/actions";
import { runServerAction } from "@/lib/run-server-action";
import { avatarColor } from "@/components/ui-kit";

const menu: Array<{
  to: string;
  label: string;
  description: string;
  iconSrc: string;
  iconActiveSrc: string;
}> = [
  { to: "/dashboard", label: "工作台", iconSrc: "/icons/nav-dashboard.png", iconActiveSrc: "/icons/nav-dashboard-active.png", description: "查看年度指标、待办、KPI 与近期动态。" },
  { to: "/annual-goals", label: "指标管理", iconSrc: "/icons/nav-goals.png", iconActiveSrc: "/icons/nav-goals-active.png", description: "管理年度指标目标与完成情况。" },
  { to: "/quarterly-work", label: "产品管理", iconSrc: "/icons/nav-product.png", iconActiveSrc: "/icons/nav-product-active.png", description: "以产品目标为核心管理关联项目、项目任务与上线后价值跟踪。" },
  { to: "/kpi", label: "KPI 管理", iconSrc: "/icons/nav-kpi.png", iconActiveSrc: "/icons/nav-kpi-active.png", description: "管理季度 KPI 评分与进度。" },
  { to: "/talent", label: "人才发展", iconSrc: "/icons/nav-talent.png", iconActiveSrc: "/icons/nav-talent-active.png", description: "管理人才盘点、评估与发展。" },
  { to: "/statistics", label: "数据统计", iconSrc: "/icons/nav-todos.png", iconActiveSrc: "/icons/nav-todos-active.png", description: "数据统计模块，建设中。" },
  { to: "/notifications", label: "通知中心", iconSrc: "/icons/nav-notifications.png", iconActiveSrc: "/icons/nav-notifications-active.png", description: "查看系统通知与消息。" },
  { to: "/organization", label: "组织架构", iconSrc: "/icons/nav-org.png", iconActiveSrc: "/icons/nav-org-active.png", description: "管理组织架构、人员与权限。" },
];

export interface AppShellUser {
  name: string;
  roleLabel: string;
  teamName: string;
  avatarInitial: string;
}

function getNameInitial(name: string) {
  return Array.from(name.trim())[0] ?? "";
}

function UserMenu({ user }: { user: AppShellUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = getNameInitial(user.name) || user.avatarInitial;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="p-2">
      <div className="relative mx-auto w-9">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white ${avatarColor(user.name)}`}
          aria-label="用户菜单"
          aria-expanded={open}
        >
          {initial}
        </button>
        {open ? (
          <div className="absolute bottom-[calc(100%+4px)] left-0 z-50 w-56 rounded-xl border border-[#F0F0F0] bg-white p-3 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white ${avatarColor(user.name)}`}>
              {initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[#181818]">{user.name}</div>
              <div className="mt-0.5 truncate text-xs text-[#777777]">{user.teamName} · {user.roleLabel}</div>
            </div>
          </div>
          <div className="my-3 h-px bg-[#F0F0F0]" />
          <form action={async () => { await runServerAction(() => logout()); }}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#181818] hover:bg-[#FAFAFA]"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </form>
        </div>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({ children, user, allowedMenus }: { children: ReactNode; user: AppShellUser; allowedMenus?: { code: string; name: string; path: string }[] }) {
  const pathname = usePathname();
  const [activePath, setActivePath] = useState(pathname);
  const allowedPaths = allowedMenus ? new Set(allowedMenus.map((m) => m.path)) : null;
  const visibleMenu = allowedPaths ? menu.filter((m) => allowedPaths.has(m.to)) : menu;
  const current = visibleMenu.find((m) => pathname.startsWith(m.to)) ?? visibleMenu[0];
  const ownsPageHeader = pathname.startsWith("/quarterly-work") || pathname === "/talent";
  const hideShellHeader = pathname === "/dashboard";

  useEffect(() => {
    setActivePath(pathname);
  }, [pathname]);

  return (
    <div className="h-screen overflow-hidden bg-[#F5F7F9]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[72px] shrink-0 flex-col border-r border-[rgba(225,225,225,0.5)] bg-white">
        <div className="flex h-14 shrink-0 items-center justify-center bg-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2F6BFF] text-white">
            <Sparkles className="h-[15px] w-[15px]" />
          </div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto px-0 py-4">
          {visibleMenu.map((m) => {
            const active = activePath.startsWith(m.to);
            return (
              <Link
                key={m.to}
                href={m.to}
                prefetch
                onClick={() => setActivePath(m.to)}
                className="flex w-12 flex-col items-center justify-center gap-[2px] text-[12px] leading-[18px] text-[#4B4B4B]"
                title={m.label}
              >
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl">
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 rounded-xl will-change-[opacity] transform-gpu transition-opacity duration-100 ease-out ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ background: "linear-gradient(208deg, #3069f91a 17%, #01f4ff0d 101%)" }}
                  />
                  <img
                    src={m.iconSrc}
                    alt=""
                    width={22}
                    height={22}
                    className={`relative h-[22px] w-[22px] ${active ? "hidden" : ""}`}
                  />
                  <img
                    src={m.iconActiveSrc}
                    alt=""
                    width={22}
                    height={22}
                    className={`relative h-[22px] w-[22px] ${active ? "" : "hidden"}`}
                  />
                </span>
                <span className="line-clamp-2 text-center text-[#4B4B4B]">{m.label}</span>
              </Link>
            );
          })}
        </nav>
        <UserMenu user={user} />
      </aside>

      {ownsPageHeader ? (
        <main className="h-full min-h-0 overflow-hidden bg-[#F5F7F9] pl-[72px]">{children}</main>
      ) : (
        <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F5F7F9] pl-[72px]">
          {hideShellHeader ? null : (
            <header className="shrink-0 bg-white px-4 py-4">
              <h1 className="text-2xl font-semibold tracking-tight text-[#181818]">{current?.label ?? "工作台"}</h1>
              <p className="mt-2 text-sm text-[#777777]">{current?.description ?? ""}</p>
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </main>
      )}
    </div>
  );
}
