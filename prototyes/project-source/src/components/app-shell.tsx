import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
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
import { getCurrentUser, isLoggedIn, logout } from "@/lib/session";
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

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate({ to: "/login" });
    } else {
      setUser(getCurrentUser());
    }
  }, [navigate, path]);

  const current = menu.find((m) => path.startsWith(m.to));

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
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
          {menu.map((m) => {
            const Icon = m.icon;
            const active = path.startsWith(m.to);
            return (
              <Link
                key={m.to}
                to={m.to}
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
        <div className="px-4 py-3 border-t border-sidebar-border text-xs text-muted-foreground">
          MVP v0.1 · 本地演示
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center px-6 gap-4">
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
              {user.avatar}
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.roleLabel} · {user.team}</div>
            </div>
            <button
              onClick={() => { logout(); navigate({ to: "/login" }); }}
              className="ml-1 w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
              title="退出"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
