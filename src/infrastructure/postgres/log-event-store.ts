import type { LogEntry, Metadata } from "../../domain/log-entry.js";
import type { DatabasePool } from "./connection.js";
import { preparePartitionsForEntries } from "./partitions.js";

function normalizeMetadata(metadata: Metadata): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, String(value)]),
  );
}

export class PostgresLogEventStore {
  public constructor(private readonly pool: DatabasePool) {}

  public async appendMany(entries: LogEntry[]): Promise<number> {
    if (entries.length === 0) return 0;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await preparePartitionsForEntries(
        client,
        entries.map((entry) => entry.occurredAt),
      );

      await client.query(
        `INSERT INTO log_events (
          occurred_at,
          severity,
          source_name,
          content,
          metadata,
          searchable_metadata
        )
        SELECT * FROM UNNEST(
          $1::timestamptz[],
          $2::text[],
          $3::text[],
          $4::text[],
          $5::jsonb[],
          $6::jsonb[]
        )`,
        [
          entries.map((entry) => entry.occurredAt.toISOString()),
          entries.map((entry) => entry.severity),
          entries.map((entry) => entry.source),
          entries.map((entry) => entry.content),
          entries.map((entry) => JSON.stringify(entry.metadata)),
          entries.map((entry) => JSON.stringify(normalizeMetadata(entry.metadata))),
        ],
      );

      await client.query("COMMIT");
      return entries.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
