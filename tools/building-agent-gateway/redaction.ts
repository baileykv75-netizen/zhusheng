const apiKeyPattern = /\bsk-[A-Za-z0-9_-]{12,}\b/g;
const windowsPathPattern = /\b[A-Za-z]:\\[^\s"']+/g;
const unixHomePattern = /\/(?:Users|home)\/[^\s"']+/g;
const phonePattern = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export class SensitiveInputError extends Error {
  readonly code = "SENSITIVE_INPUT";
}

export function sanitizeUserText(value: string, maxChars: number) {
  if (value.length > maxChars) throw new Error(`输入超过${maxChars}字符限制`);
  if (apiKeyPattern.test(value)) {
    apiKeyPattern.lastIndex = 0;
    throw new SensitiveInputError("输入疑似包含API密钥，已拒绝发送");
  }
  apiKeyPattern.lastIndex = 0;
  return value
    .replace(windowsPathPattern, "[REDACTED_LOCAL_PATH]")
    .replace(unixHomePattern, "[REDACTED_LOCAL_PATH]")
    .replace(phonePattern, "[REDACTED_PHONE]")
    .replace(emailPattern, "[REDACTED_EMAIL]");
}

export function redactError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(apiKeyPattern, "[REDACTED_KEY]")
    .replace(windowsPathPattern, "[REDACTED_LOCAL_PATH]")
    .replace(unixHomePattern, "[REDACTED_LOCAL_PATH]")
    .slice(0, 400);
}
