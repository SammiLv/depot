"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteTalentReviewTemplateWithState } from "@/server/talent/review-actions";

export function DeleteDraftTemplateDialog({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteTalentReviewTemplateWithState, {
    status: "idle" as const,
    message: "",
    requestId: "",
  });
  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-red-600 hover:text-red-700"
      >
        删除
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">删除草稿模型</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除草稿模型“{name}”吗？此操作不可恢复，关联的维度、评分档、等级区间和九宫格规则将一并删除。
            </p>
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
              <form action={action}>
                <input type="hidden" name="id" value={id} />
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
