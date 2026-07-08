import Link from "next/link";
import { cookies } from "next/headers";
import { RoleType } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { initializeAdminPassword, loginWithPassword } from "@/server/auth/actions";
import { prisma } from "@/server/db/prisma";
import { LAST_LOGIN_METHOD_COOKIE_NAME } from "@/server/auth/session";
import { AdminInitializationForm, PasswordLoginForm } from "./password-login-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; success?: string; token?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, success, token, mode } = await searchParams;

  if (token) {
    redirect(`/login/dingtalk/callback?token=${encodeURIComponent(token)}`);
  }

  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const lastLoginMethod = cookieStore.get(LAST_LOGIN_METHOD_COOKIE_NAME)?.value;
  if (lastLoginMethod === "dingtalk" && mode !== "password" && mode !== "init" && !error && !success) {
    redirect("/login/dingtalk");
  }

  const initializedAdmin = await prisma.user.findFirst({
    where: {
      roleType: RoleType.ADMIN,
      isActive: true,
      deletedAt: null,
      loginName: { not: null },
      passwordHash: { not: null },
      passwordLoginEnabled: true,
    },
    select: { id: true },
  });
  const showAdminInitEntry = !initializedAdmin;
  const isAdminInitMode = showAdminInitEntry && mode === "init";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[480px] bg-card rounded-2xl border border-border/60 p-10" style={{ boxShadow: "var(--shadow-card)" }}>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {decodeURIComponent(error)}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              {decodeURIComponent(success)}
            </div>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">登录产品部管理工作台</h1>
            <p className="mt-3 text-sm text-muted-foreground">仅支持账号密码登录和钉钉授权登录</p>
          </div>
          <div className="mt-8">
            {isAdminInitMode ? <AdminInitializationForm action={initializeAdminPassword} /> : <PasswordLoginForm action={loginWithPassword} />}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <div>
              {showAdminInitEntry ? (
                isAdminInitMode ? (
                  <Link href="/login?mode=password" className="text-primary hover:text-primary/80">
                    返回账号密码登录
                  </Link>
                ) : (
                  <Link href="/login?mode=init" className="text-primary hover:text-primary/80">
                    初始化系统管理员账号密码
                  </Link>
                )
              ) : null}
            </div>
            {lastLoginMethod === "dingtalk" ? (
              <Link href="/login?mode=password" className="text-primary hover:text-primary/80">
                改用账号密码登录
              </Link>
            ) : null}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">或</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <a
            href="/login/dingtalk"
            className="mt-6 h-12 w-full inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[15px] font-medium transition-all hover:bg-primary/90 active:scale-[0.99]"
          >
            钉钉授权登录
          </a>
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
