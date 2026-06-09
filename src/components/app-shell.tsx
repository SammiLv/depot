"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import {
  LayoutDashboard,
  Target,
  CalendarRange,
  ClipboardCheck,
  Users,
  Bell,
  CheckSquare,
  Building2,
  Search,
  LogOut,
  Sparkles,
} from "lucide-react";
import { logout } from "@/server/auth/actions";
import { avatarColor } from "@/components/ui-kit";

const menu = [
  { to: "/dashboard", label: "首页工作台", icon: LayoutDashboard },
  { to: "/annual-goals", label: "年度指标", icon: Target },
  { to: "/quarterly-work", label: "季度工作", icon: CalendarRange },
  { to: "/kpi", label: "KPI 管理", icon: ClipboardCheck },
  { to: "/talent", label: "人才发展", icon: Users },
  { to: "/todos", label: "我的待办", icon: CheckSquare },
  { to: "/notifications", label: "通知中心", icon: Bell },
  { to: "/organization", label: "组织与权限", icon: Building2 },
];

export interface AppShellUser {
  name: string;
  roleLabel: string;
  teamName: string;
  avatarInitial: string;
}

export function AppShell({ children, user, allowedMenus }: { children: ReactNode; user: AppShellUser; allowedMenus?: { code: string; name: string; path: string }[] }) {
  const pathname = usePathname();
  const allowedPaths = allowedMenus ? new Set(allowedMenus.map((m) => m.path)) : null;
  const visibleMenu = allowedPaths ? menu.filter((m) => allowedPaths.has(m.to)) : menu;
  const current = visibleMenu.find((m) => pathname.startsWith(m.to));

  return (
    <div className="h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">产品部</div>
            <div className="text-xs text-muted-foreground">管理工作台</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleMenu.map((m) => {
            const Icon = m.icon;
            const active = pathname.startsWith(m.to);
            return (
              <Link
                key={m.to}
                href={m.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                <Icon className="w-4 h-4" />
                {m.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex h-full min-w-0 flex-col md:pl-60">
        <header className="fixed left-0 right-0 top-0 z-30 h-16 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 flex items-center px-6 gap-4 md:left-60 shadow-sm">
          <h1 className="text-base font-semibold text-foreground">{current?.label ?? "工作台"}</h1>
          <div className="ml-6 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                placeholder="搜索指标、工作、人员..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted border border-transparent text-sm focus:outline-none focus:border-ring focus:bg-card transition"
              />
            </div>
          </div>
          <button className="ml-auto relative w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive" />
          </button>
          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium ${avatarColor(user.name)}`}>
              {user.avatarInitial}
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.roleLabel} · {user.teamName}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="ml-1 w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                title="退出"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="h-full overflow-y-auto p-6 pt-22">{children}</main>
      </div>
    </div>
  );
}
