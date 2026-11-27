import { prisma } from "@/server/db/prisma";
import { getDingTalkUserAvatar } from "@/server/dingtalk/organization";

const DINGTALK_LOGIN_GATEWAY = "https://gateway.rjmart.cn/research/orglogin/dingtalk/dtRedirect";
const DINGTALK_USER_INFO_URL = "https://gateway.rjmart.cn/base/dt/dtcloud/home/userInfoByAppToken";

type DingTalkUserInfoResponse = {
  code?: number | string;
  success?: boolean;
  message?: string;
  msg?: string;
  data?: {
    userId?: string;
    name?: string;
    unionId?: string;
    mobile?: string;
    email?: string;
    deptList?: Array<{ deptId?: string | number; deptName?: string; name?: string }>;
    depts?: Array<{ deptId?: string | number; deptName?: string; name?: string }>;
  };
};

type DingTalkUserInfo = {
  userId: string;
  name: string;
  mobile: string | null;
  email: string | null;
  /** 钉钉侧所属部门/组 ID 集合（deptList + depts 归一化），用于新用户部门白名单校验 */
  deptIds: string[];
};

/** 从 deptList/depts 提取部门 ID（兼容 string/number，去重） */
export function collectDeptIds(
  deptList?: Array<{ deptId?: string | number; deptName?: string; name?: string }>,
  depts?: Array<{ deptId?: string | number; deptName?: string; name?: string }>,
): string[] {
  const ids = new Set<string>();
  for (const entry of [...(deptList ?? []), ...(depts ?? [])]) {
    if (entry?.deptId !== undefined && entry.deptId !== null) {
      ids.add(String(entry.deptId));
    }
  }
  return [...ids];
}

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/$/, "");
}

export function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function getAppOrigin(request: Request) {
  const appUrl = process.env.APP_URL;
  return appUrl ? normalizeOrigin(appUrl) : getRequestOrigin(request);
}

export function getDingTalkLoginUrl(origin: string) {
  const appKey = process.env.DINGTALK_APP_KEY;
  if (!appKey) throw new Error("缺少 DINGTALK_APP_KEY 配置");

  const url = new URL(DINGTALK_LOGIN_GATEWAY);
  url.searchParams.set("appKey", appKey);
  url.searchParams.set("redirectUrl", `${normalizeOrigin(origin)}/login/dingtalk/callback`);
  return url.toString();
}

export async function getDingTalkUserInfo(token: string): Promise<DingTalkUserInfo> {
  const response = await fetch(DINGTALK_USER_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("钉钉用户信息获取失败");

  const result = await response.json() as DingTalkUserInfoResponse;
  const data = result.data;
  if (!data?.userId || !data.name) {
    throw new Error(result.message ?? result.msg ?? "钉钉登录信息无效");
  }

  return {
    userId: data.userId,
    name: data.name,
    mobile: data.mobile ?? null,
    email: data.email ?? null,
    deptIds: collectDeptIds(data.deptList, data.depts),
  };
}

/**
 * 新用户（库里按钉钉 userId / 手机号 / 邮箱都找不到）才校验部门白名单：
 * 其钉钉部门须与系统中已建档的组织节点（产品部/平台部及其下属组）有交集，
 * 否则拒绝注册。白名单随钉钉同步自动扩展，无需手工维护。
 * 存量用户不受此限制，照常登录。
 *
 * 新入职同事必然已在钉钉组织架构中，正常链路一定能查到部门；
 * 查不到部门信息属于异常，不放行（fail-closed）。
 */
async function assertNewUserDepartmentAllowed(deptIds: string[]) {
  if (deptIds.length === 0) {
    throw new Error("未能从钉钉获取到你的部门信息，无法验证是否有使用权限。请联系系统管理员处理。");
  }
  const knownNodes = await prisma.orgNode.findMany({
    where: { dingtalkDeptId: { not: null } },
    select: { dingtalkDeptId: true },
  });
  const knownDeptIds = new Set(knownNodes.map((node) => node.dingtalkDeptId as string));
  const allowed = deptIds.some((id) => knownDeptIds.has(id));
  if (!allowed) {
    throw new Error("该钉钉账号不属于系统已开通的部门（产品部/平台部），暂无使用权限。如需开通请联系系统管理员。");
  }
}

export async function findOrCreateDingTalkUser(info: DingTalkUserInfo) {
  let existingUser = await prisma.user.findUnique({
    where: { dingtalkUserId: info.userId },
  });

  if (!existingUser && (info.mobile || info.email)) {
    existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(info.mobile ? [{ mobile: info.mobile }] : []),
          ...(info.email ? [{ email: info.email }] : []),
        ],
        deletedAt: null,
      },
    });
  }

  // 登录顺带刷新头像（userInfoByAppToken 不返回头像，需额外调 getDingUser；失败不阻塞登录）
  const avatarUrl = await getDingTalkUserAvatar(info.userId);

  if (existingUser) {
    // 离职/已删除用户只刷新资料字段，不复活（不碰 isActive/deletedAt）；
    // 登录是否放行由 getCurrentUser 的 isActive+deletedAt 过滤兜底
    if (existingUser.resignedAt || existingUser.deletedAt) {
      return prisma.user.update({
        where: { id: existingUser.id },
        data: {
          dingtalkUserId: info.userId,
          name: info.name,
          mobile: info.mobile,
          email: info.email,
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      });
    }
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        dingtalkUserId: info.userId,
        name: info.name,
        mobile: info.mobile,
        email: info.email,
        ...(avatarUrl ? { avatarUrl } : {}),
        isActive: true,
        deletedAt: null,
      },
    });
  }

  // 走到这里说明是全新用户：先过部门白名单，不在产品部/平台部范围内拒绝注册
  await assertNewUserDepartmentAllowed(info.deptIds);

  return prisma.user.create({
    data: {
      dingtalkUserId: info.userId,
      name: info.name,
      mobile: info.mobile,
      email: info.email,
      avatarUrl,
    },
  });
}
