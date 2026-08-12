import {
  severityValues,
  type BatchValidationResult,
  type LogEntry,
  type Metadata,
  type MetadataValue,
  type Severity,
} from "../domain/log-entry.js";

const acceptedSeverities = new Set<string>(severityValues);
const maximumFutureOffsetMs = 5 * 60 * 1_000;

type Validation<T> = { value: T } | { issue: string };

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function readRequiredText(input: unknown, field: string): Validation<string> {
  if (typeof input !== "string") return { issue: `${field} must be a string` };

  const value = input.trim();
  if (value.length === 0) return { issue: `${field} must not be empty` };
  if (value.includes("\0")) return { issue: `${field} must not contain NUL` };

  return { value };
}

function readTimestamp(input: unknown, now: Date): Validation<Date> {
  if (typeof input !== "string") return { issue: "timestamp must be a string" };

  const includesTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(input);
  const timestamp = new Date(input);

  if (!includesTimezone || Number.isNaN(timestamp.getTime())) {
    return { issue: "timestamp must be a valid ISO 8601 value with timezone" };
  }

  if (timestamp.getTime() > now.getTime() + maximumFutureOffsetMs) {
    return { issue: "timestamp cannot be more than five minutes in the future" };
  }

  return { value: timestamp };
}

function readSeverity(input: unknown): Validation<Severity> {
  if (typeof input !== "string" || !acceptedSeverities.has(input)) {
    return { issue: "level must be one of debug, info, warn, or error" };
  }

  return { value: input as Severity };
}

function readMetadata(input: unknown): Validation<Metadata> {
  if (input === undefined) return { value: {} };
  if (!isRecord(input)) return { issue: "attributes must be a flat object" };

  const metadata: Metadata = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (key.length === 0 || key.includes("\0")) {
      return { issue: "attribute keys must be non-empty and must not contain NUL" };
    }

    const supported =
      typeof rawValue === "string" ||
      typeof rawValue === "boolean" ||
      (typeof rawValue === "number" && Number.isFinite(rawValue));

    if (!supported || (typeof rawValue === "string" && rawValue.includes("\0"))) {
      return { issue: `attribute '${key}' must be a string, finite number, or boolean` };
    }

    metadata[key] = rawValue as MetadataValue;
  }

  return { value: metadata };
}

export function validateLogEntry(input: unknown, now = new Date()): Validation<LogEntry> {
  if (!isRecord(input)) return { issue: "log entry must be an object" };

  const occurredAt = readTimestamp(input.timestamp, now);
  if ("issue" in occurredAt) return occurredAt;

  const severity = readSeverity(input.level);
  if ("issue" in severity) return severity;

  const source = readRequiredText(input.service, "service");
  if ("issue" in source) return source;

  const content = readRequiredText(input.message, "message");
  if ("issue" in content) return content;

  const metadata = readMetadata(input.attributes);
  if ("issue" in metadata) return metadata;

  return {
    value: {
      occurredAt: occurredAt.value,
      severity: severity.value,
      source: source.value,
      content: content.value,
      metadata: metadata.value,
    },
  };
}

export function validateLogBatch(entries: unknown[], now = new Date()): BatchValidationResult {
  const result: BatchValidationResult = { accepted: [], rejected: [] };

  entries.forEach((entry, position) => {
    const validation = validateLogEntry(entry, now);

    if ("issue" in validation) {
      result.rejected.push({ position, message: validation.issue });
    } else {
      result.accepted.push(validation.value);
    }
  });

  return result;
}

export function readBatchBody(body: unknown): Validation<unknown[]> {
  if (!isRecord(body)) return { issue: "request body must be an object" };
  if (!Array.isArray(body.logs)) return { issue: "request body must contain a logs array" };

  return { value: body.logs };
}
