import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, PageHeader, avatarColor } from "@/components/ui-kit";
import { Plus, Users } from "lucide-react";
import { mockUsers, teams } from "@/lib/mock-data";

export const Route = createFileRoute("/organization")({
  head: () => ({ meta: [{ title: "组织与权限 · 产品部" }] }),
  component: Org,
});

const teamMeta: Record<string, { lead: string; size: number; tone: "primary" | "info" | "brand" | "success" }> = {
  采购组: { lead: "孙宇航", size: 3, tone: "primary" },
  B端组: { lead: "王梓涵", size: 5, tone: "info" },
  C端组: { lead: "刘亦菲", size: 4, tone: "brand" },
  设计组: { lead: "赵晨曦", size: 3, tone: "success" },
};

function Org() {
  return (
    <AppShell>
      <PageHeader
        title="组织与权限"
        description="部门、小组、成员、角色与菜单/数据权限"
        action={<Button><Plus className="w-4 h-4" />新增成员</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {teams.map((t) => {
          const m = teamMeta[t];
          return (
            <Card key={t}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{t}</h3>
                <Badge tone={m.tone}>{m.size} 人</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-8 h-8 rounded-full text-white text-xs flex items-center justify-center ${avatarColor(m.lead)}`}>{m.lead[0]}</div>
                <div>
                  <div className="font-medium">{m.lead}</div>
                  <div className="text-xs text-muted-foreground">组长</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />成员列表</h3>
            <span className="text-xs text-muted-foreground">共 {mockUsers.length} 人</span>
          </div>
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">姓名</th>
                <th className="px-5 py-3 font-medium">小组</th>
                <th className="px-5 py-3 font-medium">职务</th>
                <th className="px-5 py-3 font-medium">角色</th>
                <th className="px-5 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {mockUsers.map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-muted/30 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full text-white text-xs flex items-center justify-center ${avatarColor(u.name)}`}>{u.avatar}</div>
                      <span className="text-sm font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{u.team}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{u.title}</td>
                  <td className="px-5 py-3"><Badge tone={u.role === "ADMIN" ? "brand" : u.role === "MANAGER" ? "primary" : u.role === "LEADER" ? "info" : "default"}>{u.roleLabel}</Badge></td>
                  <td className="px-5 py-3 text-right text-xs">
                    <button className="text-primary hover:underline">编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">数据权限规则</h3>
          <div className="space-y-3">
            {[
              { r: "初始管理员", d: "全部数据，不受范围限制", tone: "brand" as const },
              { r: "部门主管", d: "产品部全量数据", tone: "primary" as const },
              { r: "组长", d: "本组成员及汇总数据", tone: "info" as const },
              { r: "普通成员", d: "仅本人数据", tone: "default" as const },
            ].map((r) => (
              <div key={r.r} className="p-3 rounded-lg bg-muted/40">
                <Badge tone={r.tone}>{r.r}</Badge>
                <div className="text-xs text-muted-foreground mt-1.5">{r.d}</div>
              </div>
            ))}
          </div>

          <h3 className="font-semibold mt-6 mb-3">菜单权限</h3>
          <div className="space-y-2 text-sm">
            {["首页工作台", "年度指标", "季度工作", "KPI 管理", "人才发展", "组织与权限"].map((m, i) => (
              <div key={m} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span>{m}</span>
                <div className="flex gap-1">
                  {["管理", "主管", "组长", "成员"].map((r, j) => (
                    <span key={r} className={`w-6 h-6 rounded text-[10px] flex items-center justify-center font-medium ${
                      (i === 5 && j > 0) || (i === 4 && j > 1) ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"
                    }`}>{r[0]}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
