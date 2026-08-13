import type { LogEntry, Metadata } from "../../domain/log-entry.js";
import type { DatabasePool } from "./connection.js";
import { preparePartitionsForEntries, rememberPreparedPartitions } from "./partitions.js";

function normalizeMetadata(metadata: Metadata): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value)]));
}

export class PostgresLogEventStore {
  public constructor(
    private readonly pool: DatabasePool,
    private readonly synchronousCommit: boolean,
  ) {}

  public async appendMany(entries: LogEntry[]): Promise<number> {
    if (entries.length === 0) return 0;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (!this.synchronousCommit) await client.query("SET LOCAL synchronous_commit TO OFF");
      const preparedPartitions = await preparePartitionsForEntries(
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
      await this.incrementHourlySourceTotals(client, entries);

      await client.query("COMMIT");
      rememberPreparedPartitions(preparedPartitions);
      return entries.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async incrementHourlySourceTotals(
    client: import("pg").PoolClient,
    entries: LogEntry[],
  ): Promise<void> {
    const totals = new Map<
      string,
      { bucketStart: string; sourceName: string; eventCount: number }
    >();

    for (const entry of entries) {
      const bucket = new Date(entry.occurredAt);
      bucket.setUTCMinutes(0, 0, 0);
      const bucketStart = bucket.toISOString();
      const key = `${bucketStart}\0${entry.source}`;
      const current = totals.get(key);

      if (current === undefined) {
        totals.set(key, { bucketStart, sourceName: entry.source, eventCount: 1 });
      } else {
        current.eventCount += 1;
      }
    }

    const rows = [...totals.values()].sort((left, right) =>
      left.bucketStart === right.bucketStart
        ? left.sourceName.localeCompare(right.sourceName)
        : left.bucketStart.localeCompare(right.bucketStart),
    );

    await client.query(
      `INSERT INTO hourly_source_totals (bucket_start, source_name, event_count)
       SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::bigint[])
       ON CONFLICT (bucket_start, source_name) DO UPDATE
       SET event_count = hourly_source_totals.event_count + EXCLUDED.event_count`,
      [
        rows.map((row) => row.bucketStart),
        rows.map((row) => row.sourceName),
        rows.map((row) => row.eventCount),
      ],
    );
  }
}
