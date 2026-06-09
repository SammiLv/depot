"use server";

import { redirect } from "next/navigation";
import { clearUserSession, setUserSession } from "@/server/auth/session";

export async function selectLoginUser(formData: FormData) {
  const userId = formData.get("userId");

  if (typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  redirect(`/login?userId=${encodeURIComponent(userId)}`);
}

export async function loginAsUser(formData: FormData) {
  const userId = formData.get("userId");

  if (typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  await setUserSession(userId);

  redirect("/dashboard");
}

export async function logout() {
  await clearUserSession();
  redirect("/login");
}
