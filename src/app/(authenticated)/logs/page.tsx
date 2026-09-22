import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
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

  // 仅管理员可访问审计中心
  if (currentUser.roleType !== "ADMIN") {
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
