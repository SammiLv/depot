"use client";

import { useState } from "react";
import { Button, confirm, message } from "@rjmart/ui";

type ConfirmDeleteState = { status: string; message: string };

/**
 * 删除二次确认按钮（全部基于 @rjmart/ui）：
 * 触发器为公司库 Button（link + danger），点击弹库 confirm（危险确定按钮），
 * 确认后组装 hidden 字段调用 server action（useActionState 签名兼容），
 * 失败以 message.error 提示。
 */
export function ConfirmDeleteButton<S extends ConfirmDeleteState>({
  action,
  initialState,
  hidden,
  title,
  description,
  trigger,
  triggerClassName,
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
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    const ok = await confirm({
      title,
      description,
      okText: "确定删除",
      cancelText: "取消",
      okButtonProps: { color: "danger" },
    });
    if (!ok) return;
    const formData = new FormData();
    for (const [key, value] of Object.entries(hidden)) {
      formData.append(key, value);
    }
    setPending(true);
    try {
      const result = await action(initialState, formData);
      if (result.status === "error" && result.message) {
        message.error(result.message);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="link"
      color="danger"
      size="sm"
      disabled={disabled || pending}
      title={triggerTitle}
      onClick={handleClick}
      className={triggerClassName}
    >
      {trigger}
    </Button>
  );
}
