import Fastify, { type FastifyInstance } from "fastify";
import { logSchemaIsReady, type DatabasePool } from "../infrastructure/postgres/connection.js";
import type { RuntimeSettings } from "../runtime/settings.js";

export function createHttpServer(
  settings: RuntimeSettings,
  database: DatabasePool,
): FastifyInstance {
  const server = Fastify({
    logger: {
      level: settings.logLevel,
    },
  });

  server.get("/health", async (_request, reply) => {
    if (!(await logSchemaIsReady(database))) {
      return reply.status(503).send({ status: "starting" });
    }

    return { status: "ok" };
  });

  server.addHook("onClose", async () => {
    await database.end();
  });

  return server;
}
