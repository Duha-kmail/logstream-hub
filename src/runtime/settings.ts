export interface RuntimeSettings {
  bindAddress: string;
  listenPort: number;
  logLevel: string;
  postgresUrl: string;
  postgresPoolSize: number;
  partitionLookaheadDays: number;
  cursorSecret: string;
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

export function readRuntimeSettings(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeSettings {
  return {
    bindAddress: environment.HOST?.trim() || "0.0.0.0",
    listenPort: readInteger(environment.PORT, 8080, "PORT", 65_535),
    logLevel: environment.LOG_LEVEL?.trim() || "info",
    postgresUrl:
      environment.POSTGRES_URL?.trim() ||
      "postgres://logstream:logstream@localhost:5432/logstream",
    postgresPoolSize: readInteger(
      environment.POSTGRES_POOL_SIZE,
      8,
      "POSTGRES_POOL_SIZE",
      50,
    ),
    partitionLookaheadDays: readInteger(
      environment.PARTITION_LOOKAHEAD_DAYS,
      3,
      "PARTITION_LOOKAHEAD_DAYS",
      14,
    ),
    cursorSecret:
      environment.CURSOR_SECRET?.trim() || "development-cursor-secret",
  };
}
