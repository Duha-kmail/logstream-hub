import pg from "pg";
import type { RuntimeSettings } from "../../runtime/settings.js";

const { Pool } = pg;

export type DatabasePool = pg.Pool;

export function openDatabasePool(settings: RuntimeSettings): DatabasePool {
  return new Pool({
    connectionString: settings.postgresUrl,
    max: settings.postgresPoolSize,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "logstream-hub",
  });
}

export async function databaseIsReachable(pool: DatabasePool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
