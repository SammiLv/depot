"use client";

import { useState } from "react";
import { Card } from "@/components/ui-kit";
import { AuditLogTable } from "./audit-log-table";
import { AuditFilters } from "./audit-filters";

type AuditView =
  | "all"
  | "business"
  | "account"
  | "deployment"
  | "maintenance"
  | "notification";

interface AuditCenterContentProps {
  searchParams: {
    view?: string;
    page?: string;
    startDate?: string;
    endDate?: string;
    actorId?: string;
    module?: string;
    isSuccess?: string;
  };
  users: Array<{ id: string; name: string }>;
}

export function AuditCenterContent({ searchParams, users }: AuditCenterContentProps) {
  const currentView = (searchParams.view || "all") as AuditView;

  const tabs: Array<{ value: AuditView; label: string }> = [
    { value: "all", label: "全部操作" },
    { value: "business", label: "业务操作" },
    { value: "account", label: "账号、登录与权限" },
    { value: "deployment", label: "发布部署" },
    { value: "maintenance", label: "数据维护" },
    { value: "notification", label: "通知投递" },
  ];

  const setView = (view: AuditView) => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    params.delete("page"); // 切换视图时重置页码
    window.location.search = params.toString();
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">日志中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查询全平台操作日志和业务记录
          </p>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setView(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              currentView === tab.value
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <Card>
        <AuditFilters
          view={currentView}
          users={users}
          initialFilters={searchParams}
        />
        <AuditLogTable view={currentView} searchParams={searchParams} />
      </Card>
    </div>
  );
}
