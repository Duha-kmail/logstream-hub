import { openDatabasePool } from "./infrastructure/postgres/connection.js";
import { applyPendingMigrations } from "./infrastructure/postgres/migrations.js";
import { prepareDailyPartitions } from "./infrastructure/postgres/partitions.js";
import { readRuntimeSettings } from "./runtime/settings.js";
import { createHttpServer } from "./transport/http-server.js";

const settings = readRuntimeSettings();
const database = openDatabasePool(settings);
const server = createHttpServer(settings, database);

async function startService(): Promise<void> {
  await applyPendingMigrations(database);
  await prepareDailyPartitions(database, settings.partitionLookaheadDays);
  await server.listen({
    host: settings.bindAddress,
    port: settings.listenPort,
  });
}

async function stopService(signal: NodeJS.Signals): Promise<void> {
  server.log.info({ signal }, "shutdown requested");
  await server.close();
}

process.once("SIGINT", () => void stopService("SIGINT"));
process.once("SIGTERM", () => void stopService("SIGTERM"));

startService().catch((error: unknown) => {
  server.log.error({ error }, "service startup failed");
  void database.end().finally(() => {
    process.exitCode = 1;
  });
});
