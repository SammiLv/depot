/**
 * 添加审计中心菜单权限
 *
 * 仅管理员可访问
 */

import { prisma } from "@/server/db/prisma";

async function addAuditCenterMenu() {
  console.log("开始添加审计中心菜单...");

  // 1. 检查菜单是否已存在
  const existingMenu = await prisma.menuPermission.findUnique({
    where: { code: "audit-center" },
  });

  if (existingMenu) {
    console.log("审计中心菜单已存在，跳过创建");
    return;
  }

  // 2. 创建菜单权限
  const menu = await prisma.menuPermission.create({
    data: {
      code: "audit-center",
      name: "审计中心",
      path: "/audit",
      parentId: null,
      sortOrder: 100, // 放在最后
      isEnabled: true,
    },
  });

  console.log("✓ 创建菜单权限:", menu.name);

  // 3. 为 ADMIN 角色授权（系统级）
  await prisma.roleMenuPermission.create({
    data: {
      scopeType: "SYSTEM",
      departmentOrgNodeId: "",
      roleType: "ADMIN",
      menuPermissionId: menu.id,
      allowed: true,
    },
  });

  console.log("✓ 已授权 ADMIN 角色访问审计中心");

  console.log("\n审计中心菜单添加完成！");
}

// 执行
addAuditCenterMenu()
  .then(() => {
    console.log("完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("添加菜单失败:", error);
    process.exit(1);
  });
