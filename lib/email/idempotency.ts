export function generateIdempotencyKey(...parts: (string | number | undefined)[]): string {
  const cleaned = parts.filter((p) => p !== undefined && p !== null && p !== "");
  return cleaned.join(":");
}
