"use client";

import { Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, DatePicker, Select, type SelectProps } from "@rjmart/ui";

interface AuditFiltersProps {
  view: string;
  users?: Array<{ id: string; name: string }>;
  initialFilters?: {
    startDate?: string;
    endDate?: string;
    actorId?: string;
    module?: string;
    isSuccess?: string;
  };
}

const MODULE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "AUTH", label: "登录认证" },
  { value: "ACCOUNT", label: "账号管理" },
  { value: "PERMISSION", label: "权限管理" },
  { value: "ORGANIZATION", label: "组织管理" },
  { value: "KPI", label: "KPI 管理" },
  { value: "TALENT", label: "人才发展" },
  { value: "PRODUCT", label: "产品管理" },
  { value: "ANNUAL_GOAL", label: "年度指标" },
  { value: "NOTIFICATION", label: "通知管理" },
  { value: "DEPLOYMENT", label: "发布部署" },
  { value: "DATA_MAINTENANCE", label: "数据维护" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "true", label: "成功" },
  { value: "false", label: "失败" },
];

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function asSelectString(value: Parameters<NonNullable<SelectProps["onChange"]>>[0]): string {
  if (value == null || Array.isArray(value)) return "";
  return String(value);
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm leading-[22px] text-[#181818]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AuditFilters({ view, users = [], initialFilters = {} }: AuditFiltersProps) {
  const [startDate, setStartDate] = useState(initialFilters.startDate || "");
  const [endDate, setEndDate] = useState(initialFilters.endDate || "");
  const [actorId, setActorId] = useState(initialFilters.actorId || "");
  const [module, setModule] = useState(initialFilters.module || "all");
  const [isSuccess, setIsSuccess] = useState(initialFilters.isSuccess || "all");

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set("view", view);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (actorId) params.set("actorId", actorId);
    if (module !== "all") params.set("module", module);
    if (isSuccess !== "all") params.set("isSuccess", isSuccess);

    window.location.search = params.toString();
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setActorId("");
    setModule("all");
    setIsSuccess("all");
    window.location.search = `?view=${view}`;
  };

  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <FilterField label="开始时间">
          <DatePicker
            value={parseDateInput(startDate)}
            onChange={(next) => setStartDate(toDateInputValue(next))}
            placeholder="选择时间"
            allowClear
            className="w-full"
          />
        </FilterField>

        <FilterField label="结束时间">
          <DatePicker
            value={parseDateInput(endDate)}
            onChange={(next) => setEndDate(toDateInputValue(next))}
            placeholder="选择时间"
            allowClear
            className="w-full"
          />
        </FilterField>

        <FilterField label="操作人员">
          <Select
            allowSearch
            clearable
            options={users.map((user) => ({ value: user.id, label: user.name }))}
            value={actorId || null}
            onChange={(next) => setActorId(asSelectString(next))}
            placeholder="全部"
            className="w-full"
          />
        </FilterField>

        <FilterField label="模块">
          <Select
            options={MODULE_OPTIONS}
            value={module}
            onChange={(next) => setModule(asSelectString(next) || "all")}
            placeholder="全部"
            className="w-full"
          />
        </FilterField>

        <FilterField label="操作状态">
          <Select
            options={STATUS_OPTIONS}
            value={isSuccess}
            onChange={(next) => setIsSuccess(asSelectString(next) || "all")}
            placeholder="全部"
            className="w-full"
          />
        </FilterField>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSearch} size="sm" leftIcon={<Search className="h-4 w-4" />}>
          查询
        </Button>
        <Button variant="outlined" size="sm" onClick={handleReset} leftIcon={<X className="h-4 w-4" />}>
          重置
        </Button>
      </div>
    </div>
  );
}
