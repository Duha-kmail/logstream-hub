import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabasePool } from "./connection.js";

const migrationDirectory = join(process.cwd(), "database", "migrations");
const migrationLockId = 1_935_724_011;

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(migrationDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /^\d+_.+\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function applyPendingMigrations(pool: DatabasePool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS migration_history (
        migration_name TEXT PRIMARY KEY,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of await listMigrationFiles()) {
      const previous = await client.query(
        "SELECT migration_name FROM migration_history WHERE migration_name = $1",
        [filename],
      );

      if (previous.rowCount !== 0) continue;

      const sql = await readFile(join(migrationDirectory, filename), "utf8");
      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query("INSERT INTO migration_history (migration_name) VALUES ($1)", [
          filename,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]).catch(() => undefined);
    client.release();
  }
}
