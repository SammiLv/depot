const SANITIZED_ACTION_ERROR =
  /Server Components render|omitted in production builds|An error occurred in the Server/i;

/** 生产环境 Server Action 抛错时 message 可能被 Next 替换为通用文案 */
export function getServerActionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const message = error.message?.trim() ?? "";
  if (!message || SANITIZED_ACTION_ERROR.test(message)) {
    return fallback;
  }
  return message;
}
