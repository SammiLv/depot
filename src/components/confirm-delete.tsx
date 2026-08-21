"use client";

import { useActionState, useEffect, useState } from "react";

type ConfirmDeleteState = { status: string; message: string };

/**
 * 通用删除二次确认弹窗。不用浏览器 window.confirm，统一产品内弹窗样式。
 * action 为 useActionState 兼容的 server action；hidden 为随表单提交的隐藏字段。
 */
export function ConfirmDeleteButton<S extends ConfirmDeleteState>({
  action,
  initialState,
  hidden,
  title,
  description,
  trigger,
  triggerClassName = "inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700",
  disabled = false,
  triggerTitle,
}: {
  action: (state: Awaited<S>, payload: FormData) => S | Promise<S>;
  initialState: Awaited<S>;
  hidden: Record<string, string>;
  title: string;
  description: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  triggerTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);
  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <button type="button" disabled={disabled} title={triggerTitle} onClick={() => setOpen(true)} className={triggerClassName}>
        {trigger}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            {state.status === "error" && state.message && (
              <p className="mt-3 text-sm text-red-600">{state.message}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="h-9 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                取消
              </button>
              <form action={formAction}>
                {Object.entries(hidden).map(([key, value]) => (
                  <input key={key} type="hidden" name={key} value={value} />
                ))}
                <button
                  type="submit"
                  disabled={pending}
                  className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? "删除中…" : "确定删除"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
