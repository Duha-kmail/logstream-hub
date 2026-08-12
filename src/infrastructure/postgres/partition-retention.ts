import type { DatabasePool } from "./connection.js";

const partitionPattern = /^log_events_(\d{4})(\d{2})(\d{2})$/;
const retentionLockId = 1_935_724_013;

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function retentionCutoff(referenceTime: Date, retentionDays: number): Date {
  const cutoff = utcDay(referenceTime);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
}

function dayFromPartition(name: string): Date | null {
  const match = partitionPattern.exec(name);
  if (match === null) return null;

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;

  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const expected = `${year}${month}${day}`;
  const actual = value.toISOString().slice(0, 10).replaceAll("-", "");
  return actual === expected ? value : null;
}

function quotedPartition(name: string): string {
  if (!partitionPattern.test(name)) throw new Error("refused unsafe partition name");
  return `"${name}"`;
}

export async function removeExpiredPartitions(
  pool: DatabasePool,
  retentionDays: number,
  referenceTime = new Date(),
): Promise<string[]> {
  const client = await pool.connect();
  const removed: string[] = [];

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [retentionLockId]);

    const partitions = await client.query<{ partition_name: string }>(`
      SELECT child.relname AS partition_name
      FROM pg_inherits inheritance
      JOIN pg_class child ON child.oid = inheritance.inhrelid
      JOIN pg_class parent ON parent.oid = inheritance.inhparent
      JOIN pg_namespace namespace ON namespace.oid = parent.relnamespace
      WHERE namespace.nspname = 'public'
        AND parent.relname = 'log_events'
        AND child.relname ~ '^log_events_[0-9]{8}$'
    `);

    const cutoff = retentionCutoff(referenceTime, retentionDays);
    for (const row of partitions.rows) {
      const partitionDay = dayFromPartition(row.partition_name);
      if (partitionDay === null || partitionDay.getTime() >= cutoff.getTime()) continue;

      await client.query(`DROP TABLE IF EXISTS ${quotedPartition(row.partition_name)}`);
      removed.push(row.partition_name);
    }

    await client.query("COMMIT");
    return removed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
