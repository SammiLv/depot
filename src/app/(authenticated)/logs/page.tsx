import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { isMenuAllowedForUser } from "@/server/organization/menu-access";
import { AuditCenterContent } from "./content";

type PageProps = {
  searchParams?: Promise<{
    view?: string;
    page?: string;
    startDate?: string;
    endDate?: string;
    actorId?: string;
    module?: string;
    isSuccess?: string;
  }>;
};

export default async function AuditCenterPage({ searchParams }: PageProps) {
  const currentUser = await requireCurrentUser();

  // 访问权限与侧栏菜单同一口径：权限矩阵中授予 logs-center 的角色可访问（默认仅 ADMIN）
  const allowed = await isMenuAllowedForUser(currentUser, "logs-center");
  if (!allowed) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : {};

  // 查询所有活跃用户（用于筛选器）
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return <AuditCenterContent searchParams={params} users={users} />;
}
