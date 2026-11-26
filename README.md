# 产品部管理平台（department-management）

产品部内部管理系统：季度工作（项目/需求/价值跟踪）、年度指标（KPI）、人才发展、组织架构、通知中心等。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS 4 + 公司组件库 `@rjmart/ui`（发布在公司 Nexus 私服）
- Prisma 7 + SQLite（`better-sqlite3`），数据库文件 `db/dev.db`
- pnpm 11（锁定于 `packageManager` 字段）

> ⚠️ 本仓库的 Next.js 有 breaking changes，与常见旧版习惯不同。写代码前请先读
> `node_modules/next/dist/docs/` 里的相关指南（见 `AGENTS.md`）。

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 22 LTS（`.nvmrc`） | Node 24 也已验证可用 |
| pnpm | 11.20.0 | `corepack enable` 后自动按 `packageManager` 锁定 |
| 网络 | 可访问公司 Nexus 私服 | `.npmrc` 已配置 `@rjmart` scope 走 `nexus.rj-info.com` |

## 首次上手（全新克隆）

```bash
git clone <repo-url> && cd depot-clean

# 1. 安装依赖（postinstall 会自动 prisma generate，并应用 patches/ 下的组件库补丁）
corepack enable
pnpm install

# 2. 配置环境变量（默认值即可本地跑通）
cp .env.example .env        # Windows: copy .env.example .env

# 3. 初始化数据库（建表 + 演示数据 + 登录账号）
pnpm exec prisma migrate deploy --config db/prisma.config.ts
pnpm seed

# 4. 启动
pnpm dev                    # Windows 用这个
pnpm dev:home               # Mac/Linux 推荐（开启通知调度器，固定 3000 端口）
```

打开 <http://localhost:3000/login>，密码登录（密码均为 `admin1234`）：

| 账号 | 角色 |
| --- | --- |
| `admin` | 系统管理员 |
| `product-manager` | 部门主管 |
| `test-team-leader` | 组长 |
| `test-member` | 组员 |

钉钉扫码登录/通知机器人需要在 `.env` 里配置 `DINGTALK_*`，不配置不影响密码登录。

## 常用脚本

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` / `pnpm dev:home` | 启动开发服务 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | 类型检查 |
| `pnpm seed` | 增量 seed（空库自动转全量初始化） |
| `pnpm seed:full` | 全量重建演示数据（跨平台，Windows 可用） |
| `pnpm run test:quarterly-work` | 季度工作测试 |
| `pnpm run test:kpi` / `test:talent` / `test:permissions` | 其他测试套件 |

## 数据库约定（重要）

- **禁止 `prisma db push`**；dev 与现网统一走迁移文件（`migrate deploy`）。
- 改 `db/prisma/schema.prisma` 后必须自带迁移：生成迁移 SQL（`migrate diff --from-migrations`）→ 手工建迁移目录 → `migrate deploy` 验证。
- Prisma CLI 一律带 `--config db/prisma.config.ts`（它会解析 `DATABASE_URL`，默认库文件在 `db/dev.db`）。
- `dev.db` 及其备份不入库（`.gitignore` 已覆盖）。

## Windows 差异

- `package.json` 里 `dev:home` / `dev:office` 等脚本使用 POSIX 内联环境变量，Windows cmd/PowerShell 不支持，请直接用 `pnpm dev`（配置从 `.env` 读取）。
- `pnpm seed`、`pnpm seed:full`、测试命令均为跨平台，可正常使用。

## 目录结构

```text
src/
  app/            # App Router 页面（(authenticated) 为登录后区域）
  components/     # 通用组件
  server/         # 服务端领域逻辑（quarterly-work / kpi / talent / organization / ...）
db/prisma/        # schema、迁移、seed
scripts/          # 运维脚本（同步 main、现网部署等）
patches/          # pnpm 对 @rjmart/ui 的补丁（安装时自动应用，勿手改 node_modules）
requirements/     # 需求与方案文档
```

## 协作开发流程

`main` 是受保护的集成分支：**不能直接 push**（仓库所有者除外），一律通过 Pull Request 合入；PR 无需审批，可自行合并。现网部署从 `main` 手动进行。

```bash
git checkout main && git pull          # 基于最新 main
git checkout -b 姓名拼音/改动简述        # 如 zhangsan/kpi-export（建议，方便辨认，不强制）
# ... 开发、提交 ...
git push origin 姓名拼音/改动简述
# 在 GitHub 上开 Pull Request → 合并
# 本地切回 main，git pull 同步合并结果
```

约定：

- 合并 PR 前先把最新 `main` 合进自己的分支，解决冲突。
- **迁移撞车处理**：两人同时新增迁移目录时，后合入的一方把自己迁移目录名的时间戳改大，并重新 `migrate deploy` 验证。
- schema 变更必须带迁移文件（见上文「数据库约定」）。
- 组件库问题优先改 `patches/` 补丁，不要绕过。
