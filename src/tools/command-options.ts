export function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = environment[name];
  const value = raw === undefined ? fallback : Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function endpoint(environment: NodeJS.ProcessEnv): string {
  const value = environment.LOGSTREAM_URL?.trim() || "http://localhost:8080";
  return value.replace(/\/$/, "");
}
