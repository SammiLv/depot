# GitHub 同步极简清单

## 必须提交到 GitHub
这些文件要同步，换电脑后才能继续开发：

- `src/`
- `db/prisma/schema.prisma`
- `db/prisma/migrations/`
- `db/prisma/seed.ts`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `tsconfig.json`
- `eslint.config.mjs`
- `requirements/`

## 不要提交到 GitHub
这些文件继续忽略：

- `.env`
- `node_modules/`
- `.next/`
- `*.db`
- `*.log`

## 回家后怎么继续
### 1. 拉代码
```bash
git pull
```

### 2. 安装依赖
```bash
npm install
```

### 3. 准备本机 `.env`
至少保证有：

```env
DATABASE_URL="file:./dev.db"
APP_URL="http://localhost:3000"
DEV_ALLOWED_ORIGINS="localhost:3000,127.0.0.1:3000"
DINGTALK_APP_KEY="你的值"
```

### 4. 初始化本机数据库
```bash
npx prisma db push --config db/prisma.config.ts
npm run seed
```

### 5. 在家启动
```bash
npm run dev:home
```

代表：

- 地址：`http://localhost:3000/`
- 端口：`3000`

## 记忆文件说明
Claude 的记忆文件**不会自动随仓库同步**。

原因：

- 项目里的 `.claude/` 被 `.gitignore` 忽略了
- 自动记忆实际保存在仓库外的 Claude 本地目录里

所以：

- 换电脑后，代码会同步
- Claude 的本地记忆不会自动同步

如果你想同步记忆，只能额外手动导出或另存到仓库里的文档文件中。
