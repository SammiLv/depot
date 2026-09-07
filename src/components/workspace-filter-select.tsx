"use client";

import { Select, type SelectProps } from "@/components/select";

/** @deprecated 请使用 `@/components/select` 中的 `Select` */
export type WorkspaceFilterSelectProps = Omit<SelectProps, "variant" | "trigger"> & {
  plain?: boolean;
  trigger?: SelectProps["trigger"];
};

/** @deprecated 请使用 `@/components/select` 中的 `Select` */
export function WorkspaceFilterSelect({
  plain,
  trigger = "button",
  ...props
}: WorkspaceFilterSelectProps) {
  return <Select variant={plain ? "plain" : "default"} trigger={trigger} {...props} />;
}
