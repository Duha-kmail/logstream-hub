import type { DatabasePool } from "./connection.js";

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
    for (let offset = 0; offset <= lookaheadDays; offset += 1) {
      const lowerBound = moveUtcDays(today, offset);
      const upperBound = moveUtcDays(lowerBound, 1);
      const tableName = quotePartition(partitionIdentifier(lowerBound));

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${tableName}
        PARTITION OF log_events
        FOR VALUES FROM ('${lowerBound.toISOString()}') TO ('${upperBound.toISOString()}')
      `);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
