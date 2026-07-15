"use server";

import { timingSafeEqual, scryptSync } from "node:crypto";
import { RoleType } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import { clearUserSession, rememberLoginMethod, setUserSession } from "@/server/auth/session";
import { ensureInitialSystemBootstrap } from "@/server/bootstrap/system-bootstrap";

function hashPassword(password: string) {
  return scryptSync(password, "department-management", 64).toString("hex");
}

function verifyPassword(password: string, passwordHash: string) {
  const expected = Buffer.from(passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password), "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export async function loginWithPassword(formData: FormData) {
  const loginName = formData.get("loginName");
  const password = formData.get("password");

  if (typeof loginName !== "string" || typeof password !== "string" || !loginName.trim() || !password) {
    redirect("/login?error=%E8%AF%B7%E8%BE%93%E5%85%A5%E8%B4%A6%E5%8F%B7%E5%92%8C%E5%AF%86%E7%A0%81");
  }

  const normalizedLoginName = loginName.trim();
  const user = await prisma.user.findFirst({
    where: {
      loginName: normalizedLoginName,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      passwordHash: true,
      passwordLoginEnabled: true,
    },
  });

  if (!user || !user.passwordLoginEnabled || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=%E8%B4%A6%E5%8F%B7%E6%88%96%E5%AF%86%E7%A0%81%E9%94%99%E8%AF%AF");
  }

  await setUserSession(user.id);
  await rememberLoginMethod("password");
  redirect("/dashboard");
}

export async function initializeAdminPassword(formData: FormData) {
  const loginName = formData.get("loginName");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof loginName !== "string"
    || typeof password !== "string"
    || typeof confirmPassword !== "string"
    || !loginName.trim()
    || !password
    || !confirmPassword
  ) {
    redirect("/login?mode=init&error=%E8%AF%B7%E5%AE%8C%E6%95%B4%E5%A1%AB%E5%86%99%E7%AE%A1%E7%90%86%E5%91%98%E8%B4%A6%E5%8F%B7%E5%92%8C%E5%AF%86%E7%A0%81");
  }

  if (password !== confirmPassword) {
    redirect("/login?mode=init&error=%E4%B8%A4%E6%AC%A1%E8%BE%93%E5%85%A5%E7%9A%84%E5%AF%86%E7%A0%81%E4%B8%8D%E4%B8%80%E8%87%B4");
  }

  if (password.length < 8) {
    redirect("/login?mode=init&error=%E5%AF%86%E7%A0%81%E8%87%B3%E5%B0%91%E9%9C%80%E8%A6%818%E4%BD%8D");
  }

  const initializedAdmin = await prisma.user.findFirst({
    where: {
      roleType: RoleType.ADMIN,
      isActive: true,
      deletedAt: null,
      loginName: { not: null },
      passwordHash: { not: null },
      passwordLoginEnabled: true,
    },
    select: { id: true },
  });

  if (initializedAdmin) {
    redirect("/login?error=%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86%E5%91%98%E8%B4%A6%E5%8F%B7%E5%B7%B2%E5%88%9D%E5%A7%8B%E5%8C%96%EF%BC%8C%E8%AF%B7%E7%9B%B4%E6%8E%A5%E7%99%BB%E5%BD%95");
  }

  const normalizedLoginName = loginName.trim();
  const conflictingUser = await prisma.user.findFirst({
    where: {
      loginName: normalizedLoginName,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (conflictingUser) {
    redirect("/login?mode=init&error=%E8%AF%A5%E8%B4%A6%E5%8F%B7%E5%B7%B2%E8%A2%AB%E5%8D%A0%E7%94%A8");
  }

  let adminUser = await prisma.user.findFirst({
    where: {
      roleType: RoleType.ADMIN,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        name: "系统管理员",
        roleType: RoleType.ADMIN,
        title: "管理员",
        loginName: normalizedLoginName,
        passwordHash: hashPassword(password),
        passwordLoginEnabled: true,
      },
      select: { id: true },
    });

    await ensureInitialSystemBootstrap();
    redirect("/login?success=%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86%E5%91%98%E8%B4%A6%E5%8F%B7%E5%B7%B2%E5%88%9D%E5%A7%8B%E5%8C%96%EF%BC%8C%E8%AF%B7%E4%BD%BF%E7%94%A8%E8%B4%A6%E5%8F%B7%E5%AF%86%E7%A0%81%E7%99%BB%E5%BD%95");
  }

  await prisma.user.update({
    where: { id: adminUser.id },
    data: {
      loginName: normalizedLoginName,
      passwordHash: hashPassword(password),
      passwordLoginEnabled: true,
    },
  });

  await ensureInitialSystemBootstrap();
  redirect("/login?success=%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86%E5%91%98%E8%B4%A6%E5%8F%B7%E5%B7%B2%E5%88%9D%E5%A7%8B%E5%8C%96%EF%BC%8C%E8%AF%B7%E4%BD%BF%E7%94%A8%E8%B4%A6%E5%8F%B7%E5%AF%86%E7%A0%81%E7%99%BB%E5%BD%95");
}

export async function logout() {
  await clearUserSession();
  redirect("/login");
}
