import { readRuntimeSettings } from "./runtime/settings.js";
import { createHttpServer } from "./transport/http-server.js";

const settings = readRuntimeSettings();
const server = createHttpServer(settings);

async function startService(): Promise<void> {
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
  process.exitCode = 1;
});
