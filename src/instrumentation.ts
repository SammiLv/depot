export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { startNotificationScheduler } = await import("@/server/notifications/scheduler");
  startNotificationScheduler();

  // 老库升级幂等保障：重启时补发 VIEW_TALENT_CONFIG 默认授权，失败不阻断启动
  try {
    const { ensureTalentViewConfigPermissionGrants } = await import("@/server/bootstrap/system-bootstrap");
    await ensureTalentViewConfigPermissionGrants();
  } catch (error) {
    console.error("[bootstrap] 补发 VIEW_TALENT_CONFIG 默认授权失败", error);
  }
}
