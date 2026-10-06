export function safeLocalRedirect(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n\0]/.test(value)
  )
    return undefined;
  return value;
}
