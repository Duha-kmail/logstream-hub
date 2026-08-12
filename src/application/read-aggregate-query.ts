import { severityValues, type Severity } from "../domain/log-entry.js";
import { QueryInputError } from "./read-log-query.js";

export const aggregateBuckets = ["1m", "5m", "1h", "1d"] as const;
export type AggregateBucket = (typeof aggregateBuckets)[number];
export type AggregateGroup = "service" | "level";

export interface AggregateCriteria {
  from: Date;
  to: Date;
  bucket: AggregateBucket;
  groupBy: AggregateGroup | undefined;
  source: string | undefined;
  severity: Severity | undefined;
  metadata: Record<string, string>;
  phrase: string | undefined;
}

function queryRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) return {};
  return input as Record<string, unknown>;
}

function text(query: Record<string, unknown>, name: string): string | undefined {
  const value = query[name];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) throw new QueryInputError(`${name} must appear only once`);
  if (typeof value !== "string") throw new QueryInputError(`${name} must be a string`);
  if (value.includes("\0")) throw new QueryInputError(`${name} must not contain NUL`);
  return value;
}

function requiredDate(query: Record<string, unknown>, name: string): Date {
  const raw = text(query, name);
  if (raw === undefined) throw new QueryInputError(`${name} is required`);
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new QueryInputError(`${name} must include timezone`);
  }

  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new QueryInputError(`${name} is invalid`);
  return value;
}

function readBucket(query: Record<string, unknown>): AggregateBucket {
  const value = text(query, "bucket");
  if (value === undefined || !(aggregateBuckets as readonly string[]).includes(value)) {
    throw new QueryInputError("bucket must be one of 1m, 5m, 1h, or 1d");
  }
  return value as AggregateBucket;
}

function readGroup(query: Record<string, unknown>): AggregateGroup | undefined {
  const value = text(query, "group_by");
  if (value === undefined) return undefined;
  if (value !== "service" && value !== "level") {
    throw new QueryInputError("group_by must be service or level");
  }
  return value;
}

function readSeverity(query: Record<string, unknown>): Severity | undefined {
  const value = text(query, "level");
  if (value === undefined) return undefined;
  if (!(severityValues as readonly string[]).includes(value)) {
    throw new QueryInputError("level is not supported");
  }
  return value as Severity;
}

function readMetadata(query: Record<string, unknown>): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of Object.keys(query)) {
    if (!key.startsWith("attr.")) continue;
    const attributeName = key.slice(5);
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(attributeName)) {
      throw new QueryInputError("attribute filter has an invalid key");
    }
    filters[attributeName] = text(query, key) ?? "";
  }
  return filters;
}

export function readAggregateCriteria(input: unknown): AggregateCriteria {
  const query = queryRecord(input);
  const from = requiredDate(query, "since");
  const to = requiredDate(query, "until");
  if (to.getTime() <= from.getTime()) throw new QueryInputError("until must be after since");

  return {
    from,
    to,
    bucket: readBucket(query),
    groupBy: readGroup(query),
    source: text(query, "service"),
    severity: readSeverity(query),
    metadata: readMetadata(query),
    phrase: text(query, "q"),
  };
}
