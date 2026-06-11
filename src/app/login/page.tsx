import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { loginAsUser } from "@/server/auth/actions";
import { prisma } from "@/server/db/prisma";
import { getRoleLabel } from "@/server/permissions/role-labels";
import { avatarColor } from "@/lib/avatar-color";
import { Button } from "@/components/ui-kit";
import { ChevronLeft } from "lucide-react";
import { UserSelector } from "./user-selector";

type LoginPageProps = {
  searchParams: Promise<{ userId?: string; error?: string; token?: string }>;
};

function Avatar({ name, size = "large" }: { name: string; size?: "small" | "large" }) {
  const className = size === "large"
    ? "w-28 h-28 rounded-2xl text-4xl"
    : "w-10 h-10 rounded-xl text-sm";

  return (
    <div className={`${className} flex shrink-0 items-center justify-center text-white font-medium shadow-sm ${avatarColor(name)}`}>
      {name.slice(0, 1)}
    </div>
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { userId, error, token } = await searchParams;

  if (token) {
    redirect(`/login/dingtalk/callback?token=${encodeURIComponent(token)}`);
  }

  const currentUser = await getCurrentUser();

  if (currentUser) {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
    },
    orderBy: [{ roleType: "asc" }, { name: "asc" }],
  });
  const selectedUser: typeof users[number] | undefined = userId ? users.find((user) => user.id === userId) : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[480px] bg-card rounded-2xl border border-border/60 p-10 relative" style={{ boxShadow: "var(--shadow-card)" }}>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {decodeURIComponent(error)}
            </div>
          )}
          {selectedUser ? (
            <>
              <Link
                href="/login"
                className="absolute top-5 left-5 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                aria-label="返回用户选择"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>

              <div className="flex flex-col items-center pt-6">
                <Avatar name={selectedUser.name} />
                <div className="mt-5 text-xl font-semibold text-foreground">{selectedUser.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {getRoleLabel(selectedUser.roleType)}
                </div>

                <div className="h-40" />

                <div className="text-sm text-muted-foreground">
                  此账号已在使用，可直接登录产品部管理工作台
                </div>
                <form action={loginAsUser} className="w-full mt-5">
                  <input type="hidden" name="userId" value={selectedUser.id} />
                  <Button type="submit" variant="primary" size="lg" className="w-full">
                    立即登录
                  </Button>
                </form>
                <Link
                  href="/login"
                  className="mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  切换其他身份
                </Link>
              </div>
            </>
          ) : (
            <>
              <UserSelector users={users} />
              <div className="mt-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">或</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <a
                href="/login/dingtalk"
                className="mt-5 h-12 w-full inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[15px] font-medium transition-all hover:bg-primary/90 active:scale-[0.99]"
              >
                钉钉授权登录
              </a>
            </>
          )}
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-6">
        <span>© 2014–2026 产品部管理工作台 版权所有</span>
        <span className="hover:text-foreground transition-colors cursor-pointer">隐私政策</span>
        <span className="hover:text-foreground transition-colors cursor-pointer">服务协议</span>
      </footer>
    </div>
  );
}
