# Server Action 报错在生产环境被脱敏为通用提示 — 方案评估

## 现象

- 生产环境中，Server Action 内 `throw new Error("需求目标为必填项")` 等校验错误，到前端变成 Next 的通用文案
  （"An error occurred in the Server Components render…"），`getServerActionErrorMessage` 识别后显示兜底文案，
  如「保存需求失败，请检查后重试」。用户无法得知具体原因。
- 实例（server.log）：补录需求「需求目标为必填项」、编辑项目「项目已存在价值跟踪记录，仅管理员可修改上线时间」、
  「是否需要开发为必填项」等，页面均只显示通用提示。

## 原因

Next.js 生产构建会对 Server Function 抛出的错误做脱敏（防止泄露服务端细节），仅保留 digest。
官方建议（`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`）：
**可预期错误应作为返回值返回，而不是 throw。**

## 规模

- `src/server` 下约 764 处 `throw new Error("…")`，绝大多数是面向用户的中文校验文案
- 20 个 `"use server"` 文件；前端约 58 处 `runServerAction(...)` 调用；3 处 `getServerActionErrorMessage`

逐处改成 return 不现实，推荐下述低侵入方案。

## 推荐方案：服务端统一包装 + 前端统一解包

### 1. 服务端：`src/server/action-result.ts`

```ts
import { unstable_rethrow } from "next/navigation";

export type ActionFailure = { __actionError: string };

export async function toActionResult<T>(run: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);          // redirect()/notFound() 等框架控制流必须继续抛出
    if (isUserFacingError(error)) return { __actionError: error.message };
    throw error;                      // 非预期错误：维持现状（脱敏 + 记录日志）
  }
}
```

`isUserFacingError` 判定（二选一）：
- **A（推荐，零改动现有 throw）**：`error.constructor === Error` 且 message 非空 → 视为业务校验错误；
  Prisma 错误（`PrismaClientKnownRequestError` 等子类）、`TypeError` 等不透出。
- B（更严格）：新增 `class UserError extends Error`，逐步把校验 throw 改成 `UserError`；未改的仍脱敏。

### 2. 各 action 包一层（每个导出函数改 1 行）

```ts
export async function backfillQuarterlyWork(formData: FormData) {
  return toActionResult(async () => {
    // …原函数体不变…
  });
}
```

### 3. 前端：`src/lib/run-server-action.ts` 解包

```ts
const result = await action();
if (result && typeof result === "object" && "__actionError" in result) {
  throw new Error(result.__actionError);   // 客户端抛出的错误不会被脱敏
}
return result;
```

现有调用点的 `catch` + `getServerActionErrorMessage` 无需改动，即可显示真实文案。

### 注意点

- 必须 `unstable_rethrow`，否则 `requireCurrentUser()` 里的登录跳转（redirect）会被吞掉。
- 返回值类型变为 `T | ActionFailure`；经 `runServerAction` 解包后类型恢复为 `T`（可在 `runServerAction` 上用条件类型剔除 `ActionFailure`）。
- 少数未经 `runServerAction`、直接 `<form action={serverAction}>` 的调用点需要逐一排查。
- 陈旧客户端自动刷新逻辑（`shouldAutoReloadForServerActionError`）走的是 throw 路径，保持不变。

## 分期建议

1. 基础设施（`toActionResult`、`runServerAction` 解包）+ `src/server/quarterly-work/actions.ts`（产品管理，用户反馈最多）
2. 其余 action 文件（KPI、年度目标、人才、组织等）逐个包装
3. 可选：前端补齐与服务端一致的必填校验，减少依赖服务端报错

预估：第 1 期约半天（含回归：新建/编辑/补录需求、编辑项目、登录过期跳转）；第 2 期按文件机械替换。
