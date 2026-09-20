"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

// Toast 全局提示 —— 按公司 MasterGo「Message 全局提示」规范：
//   白底 #FFFFFF / 圆角 8px / padding 13px 16px / 图标文字间距 8px
//   阴影 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05)
//   图标 16px：info #3069F9 / success #00B42A / warning #FF7D00 / error #F53F3F
//   文字 14px/22 #181818；普通·成功 2s 关闭，警告·错误 5s 关闭；顶部居中叠放

export type ToastType = "info" | "success" | "warning" | "error" | "loading";

type ToastItem = {
  id: number;
  type: ToastType;
  text: string;
  leaving: boolean;
};

const TOAST_DURATION: Record<ToastType, number> = {
  info: 2000,
  success: 2000,
  warning: 5000,
  error: 5000,
  loading: 0, // 手动关闭
};

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function emitToast(type: ToastType, text: string) {
  const id = nextId++;
  items = [...items, { id, type, text, leaving: false }];
  notify();
  const duration = TOAST_DURATION[type];
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

function dismissToast(id: number) {
  items = items.map((item) => (item.id === id ? { ...item, leaving: true } : item));
  notify();
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    notify();
  }, 180);
}

export const toast = {
  info: (text: string) => emitToast("info", text),
  success: (text: string) => emitToast("success", text),
  warning: (text: string) => emitToast("warning", text),
  error: (text: string) => emitToast("error", text),
  loading: (text: string) => emitToast("loading", text),
  dismiss: dismissToast,
};

const TOAST_META: Record<ToastType, { color: string; icon: ReactNode }> = {
  info: { color: "#3069F9", icon: <Info className="h-4 w-4" /> },
  success: { color: "#00B42A", icon: <CheckCircle2 className="h-4 w-4" /> },
  warning: { color: "#FF7D00", icon: <AlertTriangle className="h-4 w-4" /> },
  error: { color: "#F53F3F", icon: <XCircle className="h-4 w-4" /> },
  loading: { color: "#3069F9", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
};

function ToastCard({ item }: { item: ToastItem }) {
  const meta = TOAST_META[item.type];
  return (
    <div
      role={item.type === "error" || item.type === "warning" ? "alert" : "status"}
      className={`flex items-center gap-2 rounded-lg bg-white py-[13px] px-4 shadow-[0_3px_6px_-4px_rgba(0,0,0,0.12),0_6px_16px_0_rgba(0,0,0,0.08),0_9px_28px_8px_rgba(0,0,0,0.05)] transition-all duration-200 ${
        item.leaving ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <span className="h-4 w-4 shrink-0" style={{ color: meta.color }}>{meta.icon}</span>
      <span className="text-sm leading-[22px] text-[#181818]">{item.text}</span>
    </div>
  );
}

/** 挂载一次（页面根节点或布局内），之后用 import { toast } 随处调用 */
const EMPTY_ITEMS: ToastItem[] = [];

function subscribeToastStore(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function ToastHost() {
  const current = useSyncExternalStore(
    subscribeToastStore,
    () => items,
    () => EMPTY_ITEMS,
  );

  if (current.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {current.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>,
    document.body,
  );
}
