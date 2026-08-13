import type pg from "pg";
import type { DatabasePool } from "./connection.js";

const preparedPartitions = new Set<string>();

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function moveUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function partitionIdentifier(day: Date): string {
  const datePart = day.toISOString().slice(0, 10).replaceAll("-", "");
  return `log_events_${datePart}`;
}

function quotePartition(identifier: string): string {
  if (!/^log_events_\d{8}$/.test(identifier)) {
    throw new Error("generated an unsafe partition identifier");
  }
  return `"${identifier}"`;
}

function timestampLiteral(value: Date): string {
  const iso = value.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(iso)) {
    throw new Error("generated an unsafe partition boundary");
  }
  return `'${iso}'`;
}

async function createPartition(client: pg.PoolClient, day: Date): Promise<void> {
  const lowerBound = startOfUtcDay(day);
  const upperBound = moveUtcDays(lowerBound, 1);
  const tableName = quotePartition(partitionIdentifier(lowerBound));

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName}
    PARTITION OF log_events
    FOR VALUES FROM (${timestampLiteral(lowerBound)}) TO (${timestampLiteral(upperBound)})
  `);
}

export async function preparePartitionsForEntries(
  client: pg.PoolClient,
  timestamps: Date[],
): Promise<string[]> {
  const days = new Map<number, Date>();

  for (const timestamp of timestamps) {
    const day = startOfUtcDay(timestamp);
    if (!preparedPartitions.has(partitionIdentifier(day))) days.set(day.getTime(), day);
  }

  if (days.size === 0) return [];

  await client.query("SELECT pg_advisory_xact_lock($1)", [1_935_724_012]);
  const created: string[] = [];
  for (const day of days.values()) {
    const identifier = partitionIdentifier(day);
    if (preparedPartitions.has(identifier)) continue;
    await createPartition(client, day);
    created.push(identifier);
  }
  return created;
}

export function rememberPreparedPartitions(partitions: string[]): void {
  for (const partition of partitions) preparedPartitions.add(partition);
}

export function forgetPreparedPartitions(partitions: string[]): void {
  for (const partition of partitions) preparedPartitions.delete(partition);
}

export async function prepareDailyPartitions(
  pool: DatabasePool,
  lookaheadDays: number,
  referenceTime = new Date(),
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [1_935_724_012]);

    const today = startOfUtcDay(referenceTime);
    const created: string[] = [];
    for (let offset = 0; offset <= lookaheadDays; offset += 1) {
      const day = moveUtcDays(today, offset);
      await createPartition(client, day);
      created.push(partitionIdentifier(day));
    }

    await client.query("COMMIT");
    rememberPreparedPartitions(created);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
