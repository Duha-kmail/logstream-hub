import { createHmac, timingSafeEqual } from "node:crypto";

export interface LogCursor {
  occurredAt: string;
  eventId: string;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createLogCursor(cursor: LogCursor, secret: string): string {
  const payload = Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  const digest = signature(payload, secret).toString("base64url");
  return `${payload}.${digest}`;
}

export function parseLogCursor(rawCursor: string, secret: string): LogCursor | null {
  try {
    const pieces = rawCursor.split(".");
    if (pieces.length !== 2) return null;

    const [payload, suppliedDigest] = pieces;
    if (payload === undefined || suppliedDigest === undefined) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(suppliedDigest)) {
      return null;
    }

    const expected = signature(payload, secret);
    const supplied = Buffer.from(suppliedDigest, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) return null;

    const value = decoded as Record<string, unknown>;
    if (typeof value.occurredAt !== "string" || Number.isNaN(Date.parse(value.occurredAt))) {
      return null;
    }
    if (typeof value.eventId !== "string" || !/^\d+$/.test(value.eventId)) return null;

    return { occurredAt: value.occurredAt, eventId: value.eventId };
  } catch {
    return null;
  }
}
