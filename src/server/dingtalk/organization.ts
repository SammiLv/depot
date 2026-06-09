import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const DINGTALK_OPENAPI_BASE = "https://gateway.rjmart.cn/base/dt/dtcloud/openapi";
const PRODUCT_DEPARTMENT_NAME = "产品部";
const PRODUCT_MEMBER_SEEDS = [
  { userId: "1152211427234246", deptId: "981702099", title: "产品经理" },
  { userId: "641969352026550698", deptId: "981702099", title: "产品专员" },
  { userId: "055830676724293820", deptId: "981702099", title: "产品经理" },
  { userId: "111566472026673795", deptId: "981702099", title: "产品经理" },
  { userId: "4969276435256080", deptId: "482439763", title: "产品经理" },
  { userId: "253261530829089793", deptId: "482439763", title: "产品经理" },
  { userId: "3201105234864237", deptId: "482439763", title: "产品经理" },
  { userId: "171301351629636045", deptId: "981551125", title: "UI设计师" },
  { userId: "01205918296323187933", deptId: "981551125", title: "UI设计师" },
  { userId: "254358536037735564", deptId: "981551125", title: "平面设计师" },
  { userId: "01285709375226646997", deptId: "981466167", title: "产品经理" },
  { userId: "231727610327591811", deptId: "981466167", title: "产品专员" },
  { userId: "01254257041320354990", deptId: "981466167", title: "产品经理" },
  { userId: "120736451036408716", deptId: "981466167", title: "产品经理" },
  { userId: "01051823102035680083", deptId: "981466167", title: "产品经理" },
  { userId: "272924206621425789", deptId: "122435118", title: "产品总监" },
];

type DingTalkApiResponse<T> = {
  code?: number | string;
  success?: boolean;
  msg?: string;
  message?: string;
  data?: T;
};

type DingTalkDepartmentNode = {
  deptId?: string | number;
  name?: string;
  deptName?: string;
  parentId?: string | number | null;
  status?: number | string | null;
  children?: DingTalkDepartmentNode[];
  userInDept?: unknown;
  deptAdmin?: unknown;
};

type DingTalkUser = {
  userId?: string;
  unionId?: string;
  name?: string;
  userName?: string;
  orgUserName?: string;
  mobile?: string;
  email?: string;
  title?: string;
  position?: string;
  orgTitle?: string;
  jobTitle?: string;
  deptList?: Array<{ deptId?: string | number; deptName?: string; name?: string }>;
  depts?: Array<{ deptId?: string | number; deptName?: string; name?: string }>;
};

type DepartmentRecord = {
  deptId: string;
  name: string;
  parentId: string | null;
  children: DepartmentRecord[];
  userInDept: unknown;
  deptAdmin: unknown;
};

type SyncResult = {
  departmentName: string;
  teams: number;
  users: number;
};

function getAppKey() {
  const appKey = process.env.DINGTALK_APP_KEY;
  if (!appKey) throw new Error("缺少 DINGTALK_APP_KEY 配置");
  return appKey;
}

async function requestDingTalk<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${DINGTALK_OPENAPI_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appKey: getAppKey(), ...body }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("钉钉接口请求失败");

  const result = await response.json() as DingTalkApiResponse<T>;
  const code = result.code == null ? 200 : Number(result.code);
  if (result.success === false || ![0, 200].includes(code)) {
    throw new Error(result.message ?? result.msg ?? "钉钉接口返回失败");
  }

  return result.data;
}

function normalizeDepartment(node: DingTalkDepartmentNode): DepartmentRecord | null {
  const deptId = node.deptId == null ? null : String(node.deptId);
  const name = node.name ?? node.deptName;
  if (!deptId || !name) return null;

  return {
    deptId,
    name,
    parentId: node.parentId == null ? null : String(node.parentId),
    children: (node.children ?? []).map(normalizeDepartment).filter((dept): dept is DepartmentRecord => Boolean(dept)),
    userInDept: node.userInDept,
    deptAdmin: node.deptAdmin,
  };
}

function flattenDepartments(departments: DepartmentRecord[]) {
  const result: DepartmentRecord[] = [];
  const visit = (department: DepartmentRecord) => {
    result.push(department);
    department.children.forEach(visit);
  };
  departments.forEach(visit);
  return result;
}

function findProductDepartment(departments: DepartmentRecord[], currentUserDeptIds: Set<string>) {
  return departments.find((dept) => dept.name === PRODUCT_DEPARTMENT_NAME)
    ?? departments.find((dept) => currentUserDeptIds.has(dept.deptId) && dept.children.length > 0)
    ?? departments.find((dept) => currentUserDeptIds.has(dept.deptId))
    ?? departments[0];
}

function extractUserIds(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item);
        if (item && typeof item === "object" && "userId" in item) return String(item.userId);
        return null;
      })
      .filter((userId): userId is string => Boolean(userId));
  }
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function getUserName(user: DingTalkUser) {
  return user.name ?? user.userName ?? user.orgUserName;
}

function getUserTitle(user: DingTalkUser) {
  return user.title ?? user.position ?? user.orgTitle ?? user.jobTitle ?? null;
}

function getUserDepartmentIds(user: DingTalkUser, fallbackDeptId?: string) {
  const deptIds = [...(user.deptList ?? []), ...(user.depts ?? [])]
    .map((dept) => dept.deptId == null ? null : String(dept.deptId))
    .filter((deptId): deptId is string => Boolean(deptId));
  return deptIds.length > 0 ? deptIds : (fallbackDeptId ? [fallbackDeptId] : []);
}

function normalizeTitle(title: string | null) {
  return title?.replace(/\s+/g, "") ?? "";
}

function inferRoleType(title: string | null): RoleType {
  const normalizedTitle = normalizeTitle(title);
  if (normalizedTitle.includes("总监") || normalizedTitle.includes("主管")) return "DEPARTMENT_MANAGER";
  if (normalizedTitle.includes("组长")) return "TEAM_LEADER";
  return "MEMBER";
}

function enrichUser(user: DingTalkUser, fallback: { deptId: string; title: string } | undefined) {
  if (!fallback) return user;
  return {
    ...user,
    title: getUserTitle(user) ?? fallback.title,
    deptList: user.deptList ?? user.depts ?? [{ deptId: fallback.deptId }],
  };
}

async function listDepartments(tree: boolean) {
  const data = await requestDingTalk<DingTalkDepartmentNode[]>("listDepartments", { deptIds: [], tree });
  return (data ?? []).map(normalizeDepartment).filter((dept): dept is DepartmentRecord => Boolean(dept));
}

async function listUserDepartments(userId: string) {
  const data = await requestDingTalk<DingTalkDepartmentNode[]>("listUserDepartments", { userId, tree: true });
  return (data ?? []).map(normalizeDepartment).filter((dept): dept is DepartmentRecord => Boolean(dept));
}

async function getDingUser(userId: string) {
  const data = await requestDingTalk<DingTalkUser>("getDingUser", { userId });
  if (!data?.userId || !getUserName(data)) throw new Error("钉钉用户信息无效");
  return data;
}

export async function syncDingTalkOrganization(currentDingTalkUserId: string | null): Promise<SyncResult> {
  const departmentTree = await listDepartments(true);
  const allDepartments = flattenDepartments(departmentTree);
  if (allDepartments.length === 0) throw new Error("未获取到钉钉部门信息");

  const currentUserDepartments = currentDingTalkUserId ? flattenDepartments(await listUserDepartments(currentDingTalkUserId)) : [];
  const currentUserDeptIds = new Set(currentUserDepartments.map((dept) => dept.deptId));
  const productDepartment = findProductDepartment(allDepartments, currentUserDeptIds);
  if (!productDepartment) throw new Error("未找到可同步的钉钉部门");

  const childDepartments = productDepartment.children;
  const syncDepartmentIds = new Set([productDepartment.deptId, ...childDepartments.map((dept) => dept.deptId)]);
  const seedByUserId = new Map(PRODUCT_MEMBER_SEEDS.map((seed) => [seed.userId, seed]));
  const userIds = new Set(PRODUCT_MEMBER_SEEDS.map((seed) => seed.userId));

  for (const department of allDepartments) {
    if (!syncDepartmentIds.has(department.deptId)) continue;
    extractUserIds(department.userInDept).forEach((userId) => userIds.add(userId));
  }

  const allSyncDepartments = [productDepartment, ...childDepartments];
  const deptAdminUserIds = new Set<string>();
  for (const dept of allSyncDepartments) {
    extractUserIds(dept.deptAdmin).forEach((userId) => deptAdminUserIds.add(userId));
  }
  deptAdminUserIds.forEach((userId) => userIds.add(userId));

  if (currentDingTalkUserId) userIds.add(currentDingTalkUserId);

  const users = await Promise.all([...userIds].map(async (userId) => {
    const user = await getDingUser(userId).catch(() => null);
    return user ? enrichUser(user, seedByUserId.get(userId)) : null;
  }));
  const validUsers = users.filter((user): user is DingTalkUser => Boolean(user?.userId && getUserName(user)));

  return prisma.$transaction(async (tx) => {
    const department = await tx.department.upsert({
      where: { dingtalkDeptId: productDepartment.deptId },
      update: { name: productDepartment.name },
      create: { dingtalkDeptId: productDepartment.deptId, name: productDepartment.name },
    });

    const teamByDingTalkDeptId = new Map<string, string>();
    for (const child of childDepartments) {
      const team = await tx.team.upsert({
        where: { dingtalkDeptId: child.deptId },
        update: { name: child.name, departmentId: department.id },
        create: { dingtalkDeptId: child.deptId, name: child.name, departmentId: department.id },
      });
      teamByDingTalkDeptId.set(child.deptId, team.id);
    }

    let departmentManagerId: string | null = null;
    const teamLeaderIds = new Map<string, string>();
    const syncedUserIds: string[] = [];
    for (const user of validUsers) {
      const seed = user.userId ? seedByUserId.get(user.userId) : undefined;
      const userDeptIds = getUserDepartmentIds(user, seed?.deptId);
      const teamId = userDeptIds.map((deptId) => teamByDingTalkDeptId.get(deptId)).find(Boolean) ?? null;
      const name = getUserName(user)!;
      const title = getUserTitle(user);
      const isDeptAdmin = deptAdminUserIds.has(user.userId!);
      const inferredRoleType = isDeptAdmin ? "DEPARTMENT_MANAGER" : inferRoleType(title);
      let existing = await tx.user.findUnique({
        where: { dingtalkUserId: user.userId },
      });

      if (!existing) {
        existing = await tx.user.findFirst({
          where: {
            deletedAt: null,
            OR: [
              ...(user.mobile ? [{ mobile: user.mobile }] : []),
              ...(user.email ? [{ email: user.email }] : []),
            ],
          },
        });
      }

      if (!existing) {
        const nameMatchedUsers = await tx.user.findMany({
          where: {
            deletedAt: null,
            departmentId: department.id,
            name,
          },
        });
        if (nameMatchedUsers.length === 1) {
          existing = nameMatchedUsers[0];
        }
      }

      const data = {
        dingtalkUserId: user.userId!,
        name,
        mobile: user.mobile ?? null,
        email: user.email ?? null,
        departmentId: department.id,
        teamId,
        title,
        roleType: existing?.roleType === "ADMIN" ? "ADMIN" : inferredRoleType,
        isActive: true,
        deletedAt: null,
      };
      const savedUser = existing
        ? await tx.user.update({ where: { id: existing.id }, data })
        : await tx.user.create({ data });
      syncedUserIds.push(savedUser.id);

      if (inferredRoleType === "DEPARTMENT_MANAGER") {
        departmentManagerId = savedUser.id;
      }
      if (inferredRoleType === "TEAM_LEADER" && teamId && !teamLeaderIds.has(teamId)) {
        teamLeaderIds.set(teamId, savedUser.id);
      }
    }

    if (departmentManagerId) {
      await tx.department.update({
        where: { id: department.id },
        data: { managerId: departmentManagerId },
      });
    }

    for (const [teamId, leaderId] of teamLeaderIds) {
      await tx.team.update({
        where: { id: teamId },
        data: { leaderId },
      });
    }

    return {
      departmentName: department.name,
      teams: childDepartments.length,
      users: syncedUserIds.length,
    };
  });
}
