export interface RuntimeSettings {
  bindAddress: string;
  listenPort: number;
  logLevel: string;
}

function readPort(rawValue: string | undefined): number {
  const port = rawValue === undefined ? 8080 : Number(rawValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

export function readRuntimeSettings(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeSettings {
  return {
    bindAddress: environment.HOST?.trim() || "0.0.0.0",
    listenPort: readPort(environment.PORT),
    logLevel: environment.LOG_LEVEL?.trim() || "info",
  };
}
