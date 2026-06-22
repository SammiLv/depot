# Claude 合并后环境刷新脚本清单

适用脚本：`scripts/refresh-env-after-merge.sh`

## 用法

```bash
./scripts/refresh-env-after-merge.sh <npm启动脚本> <端口> <APP_URL> [DEV_ALLOWED_ORIGINS]
```

参数说明：
- 第 1 个参数：`npm` 启动脚本
- 第 2 个参数：服务端口
- 第 3 个参数：`APP_URL`
- 第 4 个参数：可选，`DEV_ALLOWED_ORIGINS`

脚本会自动执行：
- `npm install`
- `npm run prisma:generate`
- `npx prisma db push --config db/prisma.config.ts --accept-data-loss`
- `npm run build`
- 停掉目标端口上的旧服务
- 按指定脚本重新启动服务
- 等待端口监听成功

## 常用命令清单

### office

```bash
./scripts/refresh-env-after-merge.sh start:office 80 http://depot.rj-info.com
```

### home

```bash
./scripts/refresh-env-after-merge.sh start:home 3000 http://localhost:3000
```

### quarterly

```bash
./scripts/refresh-env-after-merge.sh dev:quarterly 3001 http://localhost:3001 localhost:3001,127.0.0.1:3001
```

### annual

```bash
./scripts/refresh-env-after-merge.sh dev:annual 3002 http://localhost:3002 localhost:3002,127.0.0.1:3002
```

### platform

```bash
./scripts/refresh-env-after-merge.sh dev:platform 3003 http://localhost:3003 localhost:3003,127.0.0.1:3003
```

### kpi

```bash
./scripts/refresh-env-after-merge.sh dev:kpi 3004 http://localhost:3004 localhost:3004,127.0.0.1:3004
```

## 日志文件

日志会按启动脚本输出到仓库根目录，例如：
- `.refresh-start-office.log`
- `.refresh-start-home.log`
- `.refresh-dev-quarterly.log`
- `.refresh-dev-annual.log`
- `.refresh-dev-platform.log`
- `.refresh-dev-kpi.log`
