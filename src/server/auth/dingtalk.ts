import { prisma } from "@/server/db/prisma";

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
    deptList?: unknown[];
  };
};

type DingTalkUserInfo = {
  userId: string;
  name: string;
  mobile: string | null;
  email: string | null;
};

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
  };
}

export async function findOrCreateDingTalkUser(info: DingTalkUserInfo) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { dingtalkUserId: info.userId },
        ...(info.mobile ? [{ mobile: info.mobile }] : []),
        ...(info.email ? [{ email: info.email }] : []),
      ],
      deletedAt: null,
    },
  });

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        dingtalkUserId: info.userId,
        name: info.name,
        mobile: info.mobile,
        email: info.email,
        isActive: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      dingtalkUserId: info.userId,
      name: info.name,
      mobile: info.mobile,
      email: info.email,
    },
  });
}
