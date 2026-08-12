import { severityValues, type Severity } from "../domain/log-entry.js";
import { parseLogCursor, type LogCursor } from "./log-cursor.js";

export interface LogSearchCriteria {
  source: string | undefined;
  severity: Severity | undefined;
  from: Date | undefined;
  to: Date | undefined;
  metadata: Record<string, string>;
  phrase: string | undefined;
  pageSize: number;
  cursor: LogCursor | undefined;
}

export class QueryInputError extends Error {}

function asQueryRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) return {};
  return input as Record<string, unknown>;
}

function scalar(query: Record<string, unknown>, name: string): string | undefined {
  const value = query[name];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) throw new QueryInputError(`${name} must appear only once`);
  if (typeof value !== "string") throw new QueryInputError(`${name} must be a string`);
  if (value.includes("\0")) throw new QueryInputError(`${name} must not contain NUL`);
  return value;
}

function optionalDate(query: Record<string, unknown>, name: string): Date | undefined {
  const raw = scalar(query, name);
  if (raw === undefined) return undefined;
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) throw new QueryInputError(`${name} must include timezone`);

  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new QueryInputError(`${name} is invalid`);
  return value;
}

function pageSize(query: Record<string, unknown>): number {
  const raw = scalar(query, "limit");
  if (raw === undefined) return 100;
  if (!/^\d+$/.test(raw)) throw new QueryInputError("limit must be an integer");

  const value = Number(raw);
  if (value < 1 || value > 1_000) {
    throw new QueryInputError("limit must be between 1 and 1000");
  }
  return value;
}

function severity(query: Record<string, unknown>): Severity | undefined {
  const raw = scalar(query, "level");
  if (raw === undefined) return undefined;
  if (!(severityValues as readonly string[]).includes(raw)) {
    throw new QueryInputError("level is not supported");
  }
  return raw as Severity;
}

function metadataFilters(query: Record<string, unknown>): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const key of Object.keys(query)) {
    if (!key.startsWith("attr.")) continue;
    const metadataKey = key.slice(5);
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(metadataKey)) {
      throw new QueryInputError("attribute filter has an invalid key");
    }
    filters[metadataKey] = scalar(query, key) ?? "";
  }

  return filters;
}

export function readLogSearchCriteria(input: unknown, cursorSecret: string): LogSearchCriteria {
  const query = asQueryRecord(input);
  const from = optionalDate(query, "since");
  const to = optionalDate(query, "until");
  if (from !== undefined && to !== undefined && to.getTime() <= from.getTime()) {
    throw new QueryInputError("until must be after since");
  }

  const rawCursor = scalar(query, "cursor");
  const cursor = rawCursor === undefined ? undefined : parseLogCursor(rawCursor, cursorSecret);
  if (rawCursor !== undefined && cursor === null) throw new QueryInputError("cursor is invalid");

  return {
    source: scalar(query, "service"),
    severity: severity(query),
    from,
    to,
    metadata: metadataFilters(query),
    phrase: scalar(query, "q"),
    pageSize: pageSize(query),
    cursor: cursor ?? undefined,
  };
}
