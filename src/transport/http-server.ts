import Fastify, { type FastifyInstance } from "fastify";
import { ingestLogBatch } from "../application/ingest-log-batch.js";
import { QueryInputError, readLogSearchCriteria } from "../application/read-log-query.js";
import { logSchemaIsReady, type DatabasePool } from "../infrastructure/postgres/connection.js";
import { PostgresLogEventReader } from "../infrastructure/postgres/log-event-reader.js";
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
  const eventReader = new PostgresLogEventReader(database, settings.cursorSecret);

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

  server.get("/logs", async (request, reply) => {
    try {
      const criteria = readLogSearchCriteria(request.query, settings.cursorSecret);
      const page = await eventReader.find(criteria);
      return { logs: page.logs, next_cursor: page.nextCursor };
    } catch (error) {
      if (error instanceof QueryInputError) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }
  });

  server.addHook("onClose", async () => {
    await database.end();
  });

  return server;
}
