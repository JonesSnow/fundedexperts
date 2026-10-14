export function toDisplayNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatAmount(value: unknown, currency?: string | null): string | null {
  const amount = toDisplayNumber(value);
  if (amount === null) return null;

  try {
    return new Intl.NumberFormat(undefined, {
      ...(currency ? { style: "currency", currency } : {}),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function humanizeStatus(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
