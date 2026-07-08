import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/current-user";

export const LAST_LOGIN_METHOD_COOKIE_NAME = "department_mvp_last_login_method";

function useSecureSessionCookie() {
  const value = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

export async function setUserSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: userId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureSessionCookie(),
  });
}

export async function rememberLoginMethod(method: "password" | "dingtalk") {
  const cookieStore = await cookies();
  cookieStore.set({
    name: LAST_LOGIN_METHOD_COOKIE_NAME,
    value: method,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureSessionCookie(),
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
