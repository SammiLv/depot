# 本地运行指南

## 公司电脑
执行：

```bash
npm run dev:office
```

代表：

- 访问地址：`http://depot.rj-info.com/`
- 端口：`80`

## 家里电脑
执行：

```bash
npm run dev:home
```

代表：

- 访问地址：`http://localhost:3000/`
- 端口：`3000`

## 重建数据库
如果换电脑后本地没有数据库文件，不提交 `.db` 也可以，直接重建：

```bash
npx prisma db push --config db/prisma.config.ts
npm run seed
```

代表：

- 按当前 Prisma 结构建表
- 写入 seed 初始数据

## 说明

- 公司电脑和家里电脑是两台不同机器，可以同时运行，互不冲突。
- 只有在同一台电脑、同一个仓库目录里同时启动两个 `next dev`，才会冲突。
- 数据库文件 `*.db` 不提交到 GitHub，只提交可重建数据库的 Prisma 文件。
