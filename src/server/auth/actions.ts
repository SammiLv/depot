"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import { clearUserSession, setUserSession } from "@/server/auth/session";

export async function loginAsUser(formData: FormData) {
  const userId = formData.get("userId");

  if (typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!user) {
    redirect("/login?error=%E7%94%A8%E6%88%B7%E4%B8%8D%E5%AD%98%E5%9C%A8%E6%88%96%E5%B7%B2%E7%A6%81%E7%94%A8");
  }

  await setUserSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await clearUserSession();
  redirect("/login");
}
