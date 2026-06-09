import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { CheckSquare } from "lucide-react";

export default async function TodosPage() {
  const currentUser = await requireCurrentUser();
  const todos = await prisma.todoItem.findMany({
    where: { userId: currentUser.id },
    orderBy: [{ isDone: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  const pendingCount = todos.filter((t) => !t.isDone).length;
  const doneCount = todos.filter((t) => t.isDone).length;

  return (
    <>
      <PageHeader
        title="我的待办"
        description={`共 ${todos.length} 项，${pendingCount} 项待处理，${doneCount} 项已完成`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <div className="text-xs text-muted-foreground">待我处理</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{pendingCount}</span>
            <Badge tone="warning">待处理</Badge>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">已完成</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{doneCount}</span>
            <Badge tone="success">已完成</Badge>
          </div>
        </Card>
      </div>

      <Card>
        <div className="space-y-3">
          {todos.length ? (
            todos.map((todo) => (
              <div key={todo.id} className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/60 transition">
                <CheckSquare className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">{todo.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{todo.description ?? todo.targetType}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge tone={todo.isDone ? "success" : "primary"}>
                      {todo.isDone ? "已完成" : "待处理"}
                    </Badge>
                    {todo.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        截止：{todo.dueDate.toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4">暂无待办</p>
          )}
        </div>
      </Card>
    </>
  );
}
