"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui-kit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { queryAuditLogsAction } from "./actions";
import { type UnifiedAuditRecord } from "@/server/audit";

interface AuditLogTableProps {
  view: string;
  searchParams: Record<string, string | undefined>;
}

export function AuditLogTable({ view, searchParams }: AuditLogTableProps) {
  const [records, setRecords] = useState<UnifiedAuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = 50;

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const result = await queryAuditLogsAction({
          view,
          page,
          pageSize,
          startDate: searchParams.startDate,
          endDate: searchParams.endDate,
          actorId: searchParams.actorId,
          module: searchParams.module,
          isSuccess: searchParams.isSuccess
            ? searchParams.isSuccess === "true"
            : undefined,
        });

        setRecords(result.records);
        setTotal(result.total);
      } catch (error) {
        console.error("加载日志失败:", error);
        setRecords([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [view, page, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">暂无日志记录</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">操作时间</th>
              <th className="px-4 py-3 text-left font-medium">操作人</th>
              <th className="px-4 py-3 text-left font-medium">模块</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
              <th className="px-4 py-3 text-left font-medium">业务对象</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDateTime(record.operatedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {record.actorName || "系统"}
                  </div>
                  {record.actorType !== "USER" && (
                    <div className="text-xs text-muted-foreground">
                      {getActorTypeLabel(record.actorType)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="primary">{getModuleLabel(record.module)}</Badge>
                </td>
                <td className="px-4 py-3">{record.actionName}</td>
                <td className="px-4 py-3">
                  {formatBusinessObject(record)}
                </td>
                <td className="px-4 py-3">
                  {record.isSuccess ? (
                    <Badge tone="success">成功</Badge>
                  ) : (
                    <Badge tone="danger">失败</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 {total} 条记录，第 {page} / {totalPages} 页
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.set("page", String(page - 1));
              window.location.search = params.toString();
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.set("page", String(page + 1));
              window.location.search = params.toString();
            }}
          >
            下一页
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getActorTypeLabel(actorType: string): string {
  const labels: Record<string, string> = {
    USER: "用户",
    SYSTEM: "系统",
    DEPLOYMENT_SCRIPT: "部署脚本",
    DATA_MAINTENANCE: "数据维护",
  };
  return labels[actorType] || actorType;
}

function getModuleLabel(module: string): string {
  const labels: Record<string, string> = {
    PRODUCT_MANAGEMENT: "产品管理",
    KPI: "KPI",
    TALENT: "人才发展",
    ANNUAL_GOAL: "年度指标",
    ACCOUNT: "账号",
    AUTH: "认证",
    PERMISSION: "权限",
    ORGANIZATION: "组织",
    NOTIFICATION: "通知",
    DEPLOYMENT: "发布",
    DATA_MAINTENANCE: "数据维护",
    SYSTEM: "系统",
  };
  return labels[module] || module;
}

function formatBusinessObject(record: UnifiedAuditRecord): string {
  // 如果有对象名称，优先显示
  if (record.objectName) {
    return record.objectName;
  }

  // 如果有对象类型，显示类型标签
  if (record.objectType) {
    const typeLabels: Record<string, string> = {
      User: "用户",
      Project: "项目",
      QuarterlyWork: "需求",
      ProductGoal: "产品目标",
      PersonalKpi: "个人 KPI",
      TalentReviewTemplateVersion: "人才模板",
      EmployeeTalentProfile: "人才档案",
      NotificationScenario: "通知场景",
    };
    const typeLabel = typeLabels[record.objectType] || record.objectType;

    // 如果有 ID，拼接显示
    if (record.objectId) {
      const shortId = record.objectId.substring(0, 8);
      return `${typeLabel} (${shortId}...)`;
    }

    return typeLabel;
  }

  return "-";
}
