import { NextResponse } from "next/server";
import { findOrCreateDingTalkUser, getAppOrigin, getDingTalkUserInfo } from "@/server/auth/dingtalk";
import { rememberLoginMethod, setUserSession } from "@/server/auth/session";
import { writeAuditEvent, writeAuditFailure, AUDIT_MODULES, AUDIT_ACTION_CODES } from "@/server/audit";
import { prisma } from "@/server/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getAppOrigin(request);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=dingtalk_missing_token", origin));
  }

  try {
    const userInfo = await getDingTalkUserInfo(token);
    const user = await findOrCreateDingTalkUser(userInfo);
    await setUserSession(user.id);
    await rememberLoginMethod("dingtalk");

    // 记录钉钉登录成功日志（与密码登录同一 AuditEvent 通道）
    await prisma.$transaction(async (tx) => {
      await writeAuditEvent(tx, {
        actorId: user.id,
        actorType: "USER",
        actorName: user.name,
        module: AUDIT_MODULES.AUTH,
        actionCode: AUDIT_ACTION_CODES.LOGIN_SUCCESS,
        actionName: "钉钉登录",
        isSuccess: true,
        operationNote: `登录方式: dingtalk；钉钉姓名: ${userInfo.name}`,
      });
    });

    return NextResponse.redirect(new URL("/dashboard", origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "钉钉登录失败";

    // 记录钉钉登录失败日志（事务已回滚，独立写入）
    await writeAuditFailure({
      actorType: "USER",
      module: AUDIT_MODULES.AUTH,
      actionCode: AUDIT_ACTION_CODES.LOGIN_FAILURE,
      actionName: "钉钉登录",
      failureReason: message,
    });

    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", message);
    return NextResponse.redirect(loginUrl);
  }
}
