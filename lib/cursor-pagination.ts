import { Buffer } from "node:buffer";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreatedAtCursor {
  id: string;
  createdAt: Date;
}

export type CursorPageParseResult =
  | { success: true; limit: number; cursor: CreatedAtCursor | null }
  | { success: false; error: "Invalid page size" | "Invalid page cursor" };

export function parseCursorPage(searchParams: URLSearchParams): CursorPageParseResult {
  const limits = searchParams.getAll("limit");
  const cursors = searchParams.getAll("before");
  if (limits.length > 1) return { success: false, error: "Invalid page size" };
  if (cursors.length > 1) return { success: false, error: "Invalid page cursor" };

  let limit = DEFAULT_PAGE_SIZE;
  const rawLimit = limits[0];
  if (rawLimit !== undefined) {
    if (!/^\d{1,3}$/.test(rawLimit)) return { success: false, error: "Invalid page size" };
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return { success: false, error: "Invalid page size" };
    }
  }

  const rawCursor = cursors[0];
  if (rawCursor === undefined) return { success: true, limit, cursor: null };
  if (!rawCursor || rawCursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) {
    return { success: false, error: "Invalid page cursor" };
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { success: false, error: "Invalid page cursor" };
    }
    const record = payload as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      !UUID_PATTERN.test(record.id) ||
      typeof record.createdAt !== "string"
    ) {
      return { success: false, error: "Invalid page cursor" };
    }
    const createdAt = new Date(record.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== record.createdAt) {
      return { success: false, error: "Invalid page cursor" };
    }
    return { success: true, limit, cursor: { id: record.id, createdAt } };
  } catch {
    return { success: false, error: "Invalid page cursor" };
  }
}

export function encodeCreatedAtCursor(cursor: CreatedAtCursor): string {
  if (!UUID_PATTERN.test(cursor.id) || Number.isNaN(cursor.createdAt.getTime())) {
    throw new Error("Cannot encode an invalid page cursor");
  }
  return Buffer.from(JSON.stringify({ id: cursor.id, createdAt: cursor.createdAt.toISOString() })).toString("base64url");
}
