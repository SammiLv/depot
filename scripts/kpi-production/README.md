# KPI 生产迁移脚本

生产服务器为 Windows，项目固定部署在：

```text
C:\appdeploy\depot
```

PowerShell 脚本会根据自身位置自动确定：

```text
项目目录：C:\appdeploy\depot
生产数据库：C:\appdeploy\depot\db\dev.db
备份根目录：C:\appdeploy\depot-kpi-backups
生产地址：http://depot.rj-info.com:80
```

不需要配置文件，也不需要填写绝对路径。原有 `.sh` 文件只保留给
Linux/macOS 演练使用，Windows 生产服务器必须执行 `.ps1` 文件。

## 0. 确认环境和 PM2 进程

以管理员或部署账号打开 PowerShell，进入项目：

```powershell
cd C:\appdeploy\depot
Set-ExecutionPolicy -Scope Process Bypass
```

执行只读检查：

```powershell
.\scripts\kpi-production\00-check-environment.ps1
```

脚本通过 `pm2 jlist` 查找 `pm_cwd` 等于
`C:\appdeploy\depot` 的进程，并输出：

```text
Detected PM2 service: <实际进程名>
```

如果无法唯一识别，先运行：

```powershell
pm2 list
```

然后在当前 PowerShell 窗口指定进程名：

```powershell
$env:KPI_PM2_SERVICE_NAME = "pm2 list 中的实际名称"
```

再次执行 `00-check-environment.ps1`。不需要修改项目代码或配置文件。

## 1. 运行编号

本次迁移选择一个唯一编号，01～07 全部使用同一个值：

```powershell
$RunId = "20260728-kpi-policy-v1"
```

运行编号用于关联备份、日志、校验报告和步骤状态。文件会存放到：

```text
C:\appdeploy\depot-kpi-backups\kpi-migration-20260728-kpi-policy-v1
```

已经使用过的编号不能再次使用。

## 2. 脚本清单

| 步骤 | Windows 脚本 | 作用 |
| --- | --- | --- |
| 00 | `00-check-environment.ps1` | 只读检查路径、Node、NPM 和 PM2 |
| 01 | `01-preflight.ps1` | 只读预检和数据迁移 dry-run |
| 02 | `02-stop-service.ps1` | 停止 PM2 并确认 SQLite 文件已释放 |
| 03 | `03-build-release.ps1` | 备份旧 `.next`、生成 Prisma Client、构建新版 |
| 04 | `04-migrate-data.ps1` | 备份数据库并定向清理/迁移 KPI 数据 |
| 05 | `05-align-and-deploy.ps1` | 对齐 migration history 并执行 migrate deploy |
| 06 | `06-verify.ps1` | 校验保留数据、KPI 清理结果和 migration 状态 |
| 07 | `07-start-and-smoke.ps1` | 启动服务并检查登录页和受保护路由 |
| 08 | `08-rollback.ps1` | 恢复旧数据库和迁移前 `.next` |
| 09 | `09-run-all.ps1` | 按 01～07 顺序自动执行 |

每个步骤都会生成 `.ok` 标记，不能跳过前置步骤。

## 3. 推荐：首次分步骤执行

```powershell
$RunId = "20260728-kpi-policy-v1"

.\scripts\kpi-production\01-preflight.ps1 -RunId $RunId
.\scripts\kpi-production\02-stop-service.ps1 -RunId $RunId
.\scripts\kpi-production\03-build-release.ps1 -RunId $RunId
.\scripts\kpi-production\04-migrate-data.ps1 -RunId $RunId
.\scripts\kpi-production\05-align-and-deploy.ps1 -RunId $RunId
.\scripts\kpi-production\06-verify.ps1 -RunId $RunId
.\scripts\kpi-production\07-start-and-smoke.ps1 -RunId $RunId
```

规则：

- 任一步出现红色错误，立即停止，不执行下一步。
- 01 只读，不会修改生产数据。
- 02 开始进入维护窗口并停止生产服务。
- 04 会生成数据库备份后才修改数据。
- 06 必须显示 `PASS` 才能执行 07。
- 07 会检查 `/login` 返回 200，`/kpi` 和 `/organization`
  未登录访问返回 302 或 307。

## 4. 一次执行完整流程

首次正式迁移建议使用分步骤方式。完成演练后可以使用：

```powershell
$RunId = "20260728-kpi-policy-v1"

.\scripts\kpi-production\09-run-all.ps1 `
  -RunId $RunId `
  -Execute `
  -Confirm PRODUCTION_KPI_MIGRATION
```

## 5. 回滚

先查看回滚目标，不修改任何文件：

```powershell
.\scripts\kpi-production\08-rollback.ps1 -RunId $RunId
```

确认后执行：

```powershell
.\scripts\kpi-production\08-rollback.ps1 `
  -RunId $RunId `
  -Execute `
  -Confirm ROLLBACK_KPI_PRODUCTION
```

回滚脚本会：

1. 停止新版 PM2 服务并确认数据库文件释放。
2. 验证升级前数据库备份。
3. 保存迁移失败后的数据库、WAL 和 SHM 文件作为证据。
4. 恢复升级前数据库。
5. 恢复步骤 03 自动保存的旧 `.next` 构建和 Prisma Client。
6. 验证恢复后的数据库并重启服务。

如果生产发布系统另有版本回滚命令，可以在当前 PowerShell 窗口提前设置：

```powershell
$env:KPI_ROLLBACK_CODE_COMMAND = "生产发布系统的回滚命令"
```

配置该命令后，08 会执行发布系统回滚；否则自动恢复旧 `.next`。

## 6. 迁移后的人工配置

脚本不会代替管理员完成业务配置。迁移成功后依次设置：

1. KPI 权限。
2. 系统及部门审批策略。
3. KPI 模板和适用范围。
4. 重新初始化季度 KPI。

## 7. 禁止事项

- 不执行 `scripts/refresh-env-after-merge.sh`。
- 不执行 `prisma db push` 或 `db push --accept-data-loss`。
- 不跳过预检、数据库备份或步骤 06 验证。
- 服务运行时不直接复制、覆盖或删除 `db\dev.db`。
- 步骤报错后不自行继续下一步。
