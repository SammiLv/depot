"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui-kit";

function SubmitButton({ pendingText, idleText }: { pendingText: string; idleText: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? pendingText : idleText}
    </Button>
  );
}

export function PasswordLoginForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="loginName" className="text-sm font-medium text-foreground">账号</label>
        <input
          id="loginName"
          name="loginName"
          required
          autoComplete="username"
          placeholder="请输入账号"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm focus:border-ring focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-foreground">密码</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="请输入密码"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm focus:border-ring focus:outline-none"
        />
      </div>
      <SubmitButton pendingText="登录中..." idleText="账号密码登录" />
    </form>
  );
}

export function AdminInitializationForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        首次部署时可在这里初始化系统管理员账号密码，初始化成功后入口会自动关闭。
      </div>
      <div className="space-y-2">
        <label htmlFor="initLoginName" className="text-sm font-medium text-foreground">系统管理员账号</label>
        <input
          id="initLoginName"
          name="loginName"
          required
          autoComplete="username"
          placeholder="请输入系统管理员账号"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm focus:border-ring focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="initPassword" className="text-sm font-medium text-foreground">初始化密码</label>
        <input
          id="initPassword"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="请输入初始化密码"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm focus:border-ring focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="initPasswordConfirm" className="text-sm font-medium text-foreground">确认密码</label>
        <input
          id="initPasswordConfirm"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder="请再次输入初始化密码"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm focus:border-ring focus:outline-none"
        />
      </div>
      <SubmitButton pendingText="初始化中..." idleText="初始化系统管理员账号" />
    </form>
  );
}
