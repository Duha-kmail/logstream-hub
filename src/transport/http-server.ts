import Fastify, { type FastifyInstance } from "fastify";
import type { RuntimeSettings } from "../runtime/settings.js";

export function createHttpServer(settings: RuntimeSettings): FastifyInstance {
  const server = Fastify({
    logger: {
      level: settings.logLevel,
    },
  });

  server.get("/health", async () => ({ status: "ok" }));

  return server;
}
