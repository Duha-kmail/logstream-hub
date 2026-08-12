import { severityValues, type MetadataValue, type Severity } from "../domain/log-entry.js";

const sources = ["gateway", "catalog", "orders", "billing", "mailer"] as const;
const regions = ["eu-central", "me-south", "us-west"] as const;
const messages = [
  "request completed",
  "upstream response delayed",
  "invoice created",
  "item unavailable",
  "notification queued",
] as const;

export interface SampleLog {
  timestamp: string;
  level: Severity;
  service: string;
  message: string;
  attributes: Record<string, MetadataValue>;
}

function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error("sample value collection cannot be empty");
  return item;
}

export function createSampleLog(index: number, referenceTime = Date.now()): SampleLog {
  return {
    timestamp: new Date(referenceTime - (index % 604_800) * 1_000).toISOString(),
    level: itemAt(severityValues, index),
    service: itemAt(sources, index * 3),
    message: `${itemAt(messages, index * 7)} [sample-${index}]`,
    attributes: {
      region: itemAt(regions, index),
      traceId: `trace-${index.toString(36)}`,
      durationMs: 10 + (index % 750),
      retried: index % 9 === 0,
    },
  };
}

export function createSampleBatch(start: number, size: number): SampleLog[] {
  const referenceTime = Date.now();
  return Array.from({ length: size }, (_, offset) =>
    createSampleLog(start + offset, referenceTime),
  );
}
