"use client";

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
    <Card className="mb-4 !p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-5">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setView(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              currentView === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-5 pb-5">
        <AuditFilters
          view={currentView}
          users={users}
          initialFilters={searchParams}
        />
        <AuditLogTable view={currentView} searchParams={searchParams} />
      </div>
    </Card>
  );
}
