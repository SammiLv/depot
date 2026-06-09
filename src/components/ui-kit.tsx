"use client";

import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-card border border-border p-5 ${className}`} style={{ boxShadow: "var(--shadow-card)" }}>
      {children}
    </div>
  );
}

export function StatCard({
  label, value, hint, tone = "primary", icon,
}: { label: string; value: ReactNode; hint?: string; tone?: "primary" | "success" | "warning" | "info" | "brand"; icon?: ReactNode }) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    info: "bg-info/15 text-info",
    brand: "bg-brand/15 text-brand",
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>{icon}</div>}
      </div>
    </Card>
  );
}

const badgeMap: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
  success: "bg-green-50 text-green-600 dark:bg-green-500/20 dark:text-green-300",
  warning: "bg-orange-50 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
  danger: "bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-300",
  info: "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
  brand: "bg-teal-50 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-500/20 dark:text-pink-300",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
};

export { avatarColor } from "@/lib/avatar-color";

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: keyof typeof badgeMap }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${badgeMap[tone]}`}>
      {children}
    </span>
  );
}

export function Progress({ value, tone = "primary" }: { value: number; tone?: "primary" | "success" | "warning" | "danger" | "yellow" | "orange" }) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    yellow: "bg-yellow",
    orange: "bg-orange",
  };
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${colorMap[tone]} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Button({
  children, variant = "primary", size = "md", onClick, type = "button", className = "", disabled = false,
}: { children: ReactNode; variant?: "primary" | "ghost" | "outline"; size?: "sm" | "md" | "lg"; onClick?: () => void; type?: "button" | "submit"; className?: string; disabled?: boolean }) {
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    ghost: "hover:bg-muted text-foreground",
    outline: "border border-border bg-card hover:bg-muted text-foreground",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    lg: "h-12 px-6 text-[15px]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}
