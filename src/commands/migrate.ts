import { applyPendingMigrations } from "../infrastructure/postgres/migrations.js";
import { openDatabasePool } from "../infrastructure/postgres/connection.js";
import { prepareDailyPartitions } from "../infrastructure/postgres/partitions.js";
import { readRuntimeSettings } from "../runtime/settings.js";

const settings = readRuntimeSettings();
const pool = openDatabasePool(settings);

try {
  await applyPendingMigrations(pool);
  await prepareDailyPartitions(pool, settings.partitionLookaheadDays);
} finally {
  await pool.end();
}
