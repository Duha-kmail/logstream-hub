export const severityValues = ["debug", "info", "warn", "error"] as const;

export type Severity = (typeof severityValues)[number];
export type MetadataValue = string | number | boolean;
export type Metadata = Record<string, MetadataValue>;

export interface LogEntry {
  occurredAt: Date;
  severity: Severity;
  source: string;
  content: string;
  metadata: Metadata;
}

export interface RejectedEntry {
  position: number;
  message: string;
}

export interface BatchValidationResult {
  accepted: LogEntry[];
  rejected: RejectedEntry[];
}
