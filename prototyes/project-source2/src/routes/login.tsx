import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Check } from "lucide-react";
import { mockUsers } from "@/lib/mock-data";
import { setCurrentUser } from "@/lib/session";
import { avatarColor } from "@/components/ui-kit";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "登录 · 产品部管理工作台" },
      { name: "description", content: "选择身份进入产品部内部管理系统（MVP 模拟登录）" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(mockUsers[1].id);
  const [switching, setSwitching] = useState(false);
  const user = mockUsers.find((u) => u.id === selected)!;

  const submit = () => {
    setCurrentUser(selected);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[480px] bg-card rounded-2xl border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-10 relative">
          <button
            onClick={() => setSwitching((s) => !s)}
            className="absolute top-5 left-5 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            aria-label="切换身份"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {!switching ? (
            <div className="flex flex-col items-center pt-6">
              <div className={`w-28 h-28 rounded-2xl overflow-hidden flex items-center justify-center text-white text-4xl font-medium shadow-sm ${avatarColor(user.name)}`}>
                {user.avatar}
              </div>
              <div className="mt-5 text-xl font-semibold text-foreground">{user.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{user.roleLabel} · {user.team}</div>

              <div className="h-40" />

              <div className="text-sm text-muted-foreground">
                此账号已在使用，可直接登录 skillsHub
              </div>
              <button
                onClick={submit}
                className="mt-5 w-full h-12 rounded-full text-white text-[15px] font-medium transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: "#2563EB" }}
              >
                立即登录
              </button>
              <button
                onClick={() => setSwitching(true)}
                className="mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                切换其他身份
              </button>
            </div>
          ) : (
            <div className="pt-6">
              <div className="text-center text-base font-semibold mb-1">选择身份</div>
              <div className="text-center text-xs text-muted-foreground mb-5">MVP 演示用，按角色自动应用数据范围</div>
              <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
                {mockUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u.id); setSwitching(false); }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      selected === u.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-medium ${avatarColor(u.name)}`}>
                      {u.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{u.name} <span className="text-xs text-muted-foreground font-normal">· {u.title}</span></div>
                      <div className="text-xs text-muted-foreground">{u.roleLabel} · {u.team}</div>
                    </div>
                    {selected === u.id && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-6">
        <span>© 2014–2026 产品部管理工作台 版权所有</span>
        <a className="hover:text-foreground transition-colors" href="#">隐私政策</a>
        <a className="hover:text-foreground transition-colors" href="#">服务协议</a>
        <a className="hover:text-foreground transition-colors" href="#">法律声明</a>
      </footer>
    </div>
  );
}
