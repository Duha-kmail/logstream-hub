import type { LogEntry, RejectedEntry } from "../domain/log-entry.js";
import { readBatchBody, validateLogBatch } from "./validate-log-batch.js";

export interface LogEventWriter {
  appendMany(entries: LogEntry[]): Promise<number>;
}

export type IngestionOutcome =
  | { accepted: number; rejected: RejectedEntry[] }
  | { requestError: string };

export async function ingestLogBatch(
  body: unknown,
  writer: LogEventWriter,
): Promise<IngestionOutcome> {
  const batch = readBatchBody(body);
  if ("issue" in batch) return { requestError: batch.issue };

  const validation = validateLogBatch(batch.value);
  if (validation.accepted.length === 0) {
    return { accepted: 0, rejected: validation.rejected };
  }

  const accepted = await writer.appendMany(validation.accepted);
  return { accepted, rejected: validation.rejected };
}
