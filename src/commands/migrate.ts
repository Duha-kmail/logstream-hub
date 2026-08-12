import { applyPendingMigrations } from "../infrastructure/postgres/migrations.js";
import { openDatabasePool } from "../infrastructure/postgres/connection.js";
import { readRuntimeSettings } from "../runtime/settings.js";

const pool = openDatabasePool(readRuntimeSettings());

try {
  await applyPendingMigrations(pool);
} finally {
  await pool.end();
}
