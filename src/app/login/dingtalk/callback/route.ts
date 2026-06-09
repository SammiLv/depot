import { NextResponse } from "next/server";
import { findOrCreateDingTalkUser, getAppOrigin, getDingTalkUserInfo } from "@/server/auth/dingtalk";
import { setUserSession } from "@/server/auth/session";

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
    return NextResponse.redirect(new URL("/dashboard", origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "钉钉登录失败";
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", message);
    return NextResponse.redirect(loginUrl);
  }
}
