const CORRELATION_ID_PATTERN = /^corr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicApiCorrelationId(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;

  const correlationId = (payload as Record<string, unknown>).correlationId;
  return typeof correlationId === "string" && CORRELATION_ID_PATTERN.test(correlationId)
    ? correlationId
    : null;
}
