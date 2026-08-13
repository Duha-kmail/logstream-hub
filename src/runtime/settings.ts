export interface RuntimeSettings {
  bindAddress: string;
  listenPort: number;
  logLevel: string;
  postgresUrl: string;
  postgresPoolSize: number;
  partitionLookaheadDays: number;
  cursorSecret: string;
  retentionDays: number;
  retentionIntervalMinutes: number;
  ingestionFlushMs: number;
  ingestionBatchSize: number;
  ingestionQueueLimit: number;
  ingestionSynchronousCommit: boolean;
}

function readInteger(
  rawValue: string | undefined,
  fallback: number,
  label: string,
  maximum: number,
): number {
  const value = rawValue === undefined ? fallback : Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  }

  return value;
}

function readNonNegativeInteger(
  rawValue: string | undefined,
  fallback: number,
  label: string,
  maximum: number,
): number {
  const value = rawValue === undefined ? fallback : Number(rawValue);
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be an integer between 0 and ${maximum}`);
  }
  return value;
}

function readBoolean(rawValue: string | undefined, fallback: boolean, label: string): boolean {
  if (rawValue === undefined || rawValue === "") return fallback;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  throw new Error(`${label} must be true or false`);
}

export function readRuntimeSettings(environment: NodeJS.ProcessEnv = process.env): RuntimeSettings {
  return {
    bindAddress: environment.HOST?.trim() || "0.0.0.0",
    listenPort: readInteger(environment.PORT, 8080, "PORT", 65_535),
    logLevel: environment.LOG_LEVEL?.trim() || "info",
    postgresUrl:
      environment.POSTGRES_URL?.trim() || "postgres://logstream:logstream@localhost:5432/logstream",
    postgresPoolSize: readInteger(environment.POSTGRES_POOL_SIZE, 8, "POSTGRES_POOL_SIZE", 50),
    partitionLookaheadDays: readInteger(
      environment.PARTITION_LOOKAHEAD_DAYS,
      3,
      "PARTITION_LOOKAHEAD_DAYS",
      14,
    ),
    cursorSecret: environment.CURSOR_SECRET?.trim() || "development-cursor-secret",
    retentionDays: readInteger(environment.RETENTION_DAYS, 30, "RETENTION_DAYS", 3_650),
    retentionIntervalMinutes: readInteger(
      environment.RETENTION_INTERVAL_MINUTES,
      60,
      "RETENTION_INTERVAL_MINUTES",
      1_440,
    ),
    ingestionFlushMs: readNonNegativeInteger(
      environment.INGEST_FLUSH_MS,
      10,
      "INGEST_FLUSH_MS",
      1_000,
    ),
    ingestionBatchSize: readInteger(
      environment.INGEST_BATCH_SIZE,
      5_000,
      "INGEST_BATCH_SIZE",
      100_000,
    ),
    ingestionQueueLimit: readInteger(
      environment.INGEST_QUEUE_LIMIT,
      200_000,
      "INGEST_QUEUE_LIMIT",
      2_000_000,
    ),
    ingestionSynchronousCommit: readBoolean(
      environment.INGEST_SYNCHRONOUS_COMMIT,
      true,
      "INGEST_SYNCHRONOUS_COMMIT",
    ),
  };
}
