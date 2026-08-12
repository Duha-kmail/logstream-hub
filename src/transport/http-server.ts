import Fastify, { type FastifyInstance } from "fastify";
import { ingestLogBatch } from "../application/ingest-log-batch.js";
import { logSchemaIsReady, type DatabasePool } from "../infrastructure/postgres/connection.js";
import { PostgresLogEventStore } from "../infrastructure/postgres/log-event-store.js";
import type { RuntimeSettings } from "../runtime/settings.js";

export function createHttpServer(
  settings: RuntimeSettings,
  database: DatabasePool,
): FastifyInstance {
  const server = Fastify({
    bodyLimit: 5 * 1024 * 1024,
    logger: {
      level: settings.logLevel,
    },
  });
  const eventStore = new PostgresLogEventStore(database);

  server.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const message = statusCode >= 500 ? "internal server error" : error.message;
    void reply.status(statusCode).send({ error: message });
  });

  server.get("/health", async (_request, reply) => {
    if (!(await logSchemaIsReady(database))) {
      return reply.status(503).send({ status: "starting" });
    }

    return { status: "ok" };
  });

  server.post("/logs", async (request, reply) => {
    const outcome = await ingestLogBatch(request.body, eventStore);

    if ("requestError" in outcome) {
      return reply.status(400).send({ error: outcome.requestError });
    }

    const response = {
      accepted: outcome.accepted,
      rejected: outcome.rejected.map((entry) => ({
        index: entry.position,
        reason: entry.message,
      })),
    };

    if (outcome.accepted === 0) return reply.status(400).send(response);
    return response;
  });

  server.addHook("onClose", async () => {
    await database.end();
  });

  return server;
}
