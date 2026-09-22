"use client";

import { Button } from "@/components/ui-kit";
import { Search, X } from "lucide-react";
import { useState } from "react";

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
    <div className="mb-4 space-y-4 rounded-lg border border-border bg-muted/50 p-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* 开始时间 */}
        <div className="space-y-2">
          <label htmlFor="startDate" className="text-sm font-medium">
            开始时间
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* 结束时间 */}
        <div className="space-y-2">
          <label htmlFor="endDate" className="text-sm font-medium">
            结束时间
          </label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* 操作人员 */}
        <div className="space-y-2">
          <label htmlFor="actorId" className="text-sm font-medium">
            操作人员
          </label>
          <select
            id="actorId"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">全部</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        {/* 模块 */}
        <div className="space-y-2">
          <label htmlFor="module" className="text-sm font-medium">
            模块
          </label>
          <select
            id="module"
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">全部</option>
            <option value="AUTH">登录认证</option>
            <option value="ACCOUNT">账号管理</option>
            <option value="PERMISSION">权限管理</option>
            <option value="ORGANIZATION">组织管理</option>
            <option value="KPI">KPI 管理</option>
            <option value="TALENT">人才发展</option>
            <option value="PRODUCT">产品管理</option>
            <option value="ANNUAL_GOAL">年度指标</option>
            <option value="NOTIFICATION">通知管理</option>
            <option value="DEPLOYMENT">发布部署</option>
            <option value="DATA_MAINTENANCE">数据维护</option>
          </select>
        </div>

        {/* 操作状态 */}
        <div className="space-y-2">
          <label htmlFor="isSuccess" className="text-sm font-medium">
            操作状态
          </label>
          <select
            id="isSuccess"
            value={isSuccess}
            onChange={(e) => setIsSuccess(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">全部</option>
            <option value="true">成功</option>
            <option value="false">失败</option>
          </select>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button onClick={handleSearch} size="sm">
          <Search className="mr-2 h-4 w-4" />
          查询
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <X className="mr-2 h-4 w-4" />
          重置
        </Button>
      </div>
    </div>
  );
}
