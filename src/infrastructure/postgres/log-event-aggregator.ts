import type { AggregateBucket, AggregateCriteria } from "../../application/read-aggregate-query.js";
import type { DatabasePool } from "./connection.js";

const bucketIntervals: Record<AggregateBucket, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "1h": "1 hour",
  "1d": "1 day",
};

interface AggregateRow {
  bucket_start: Date;
  group_value: string | null;
  event_count: string;
}

export interface AggregatePoint {
  start: string;
  group: string | null;
  count: number;
}

function appendFilter(
  conditions: string[],
  values: unknown[],
  expression: string,
  value: unknown,
): void {
  values.push(value);
  conditions.push(expression.replace("?", `$${values.length}`));
}

function escapedPhrase(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&").toLowerCase()}%`;
}

export class PostgresLogEventAggregator {
  public constructor(private readonly pool: DatabasePool) {}

  public async summarize(criteria: AggregateCriteria): Promise<AggregatePoint[]> {
    if (criteria.phrase === undefined && Object.keys(criteria.metadata).length === 0) {
      return this.summarizeDimensions(criteria);
    }

    const conditions: string[] = [];
    const values: unknown[] = [];

    appendFilter(conditions, values, "occurred_at >= ?::timestamptz", criteria.from.toISOString());
    appendFilter(conditions, values, "occurred_at < ?::timestamptz", criteria.to.toISOString());

    if (criteria.source !== undefined) {
      appendFilter(conditions, values, "source_name = ?", criteria.source);
    }
    if (criteria.severity !== undefined) {
      appendFilter(conditions, values, "severity = ?", criteria.severity);
    }
    if (Object.keys(criteria.metadata).length > 0) {
      appendFilter(
        conditions,
        values,
        "searchable_metadata @> ?::jsonb",
        JSON.stringify(criteria.metadata),
      );
    }
    if (criteria.phrase !== undefined) {
      appendFilter(
        conditions,
        values,
        "lower(content) LIKE ? ESCAPE '\\'",
        escapedPhrase(criteria.phrase),
      );
    }

    values.push(bucketIntervals[criteria.bucket]);
    const intervalParameter = `$${values.length}::interval`;
    const groupExpression =
      criteria.groupBy === "service"
        ? "source_name"
        : criteria.groupBy === "level"
          ? "severity"
          : "NULL::text";

    const result = await this.pool.query<AggregateRow>(
      `SELECT
         date_bin(${intervalParameter}, occurred_at, '1970-01-01T00:00:00Z') AS bucket_start,
         ${groupExpression} AS group_value,
         COUNT(*)::text AS event_count
       FROM log_events
       WHERE ${conditions.join(" AND ")}
       GROUP BY bucket_start, group_value
       ORDER BY bucket_start ASC, group_value ASC NULLS FIRST`,
      values,
    );

    return result.rows.map((row) => ({
      start: row.bucket_start.toISOString(),
      group: row.group_value,
      count: Number(row.event_count),
    }));
  }

  private async summarizeDimensions(criteria: AggregateCriteria): Promise<AggregatePoint[]> {
    const values: unknown[] = [
      criteria.from.toISOString(),
      criteria.to.toISOString(),
      bucketIntervals[criteria.bucket],
    ];
    const filters: string[] = [];
    if (criteria.source !== undefined) {
      values.push(criteria.source);
      filters.push(`source_name = $${values.length}`);
    }
    if (criteria.severity !== undefined) {
      values.push(criteria.severity);
      filters.push(`severity = $${values.length}`);
    }

    const filterSql = filters.length === 0 ? "" : `AND ${filters.join(" AND ")}`;
    const groupExpression =
      criteria.groupBy === "service"
        ? "source_name"
        : criteria.groupBy === "level"
          ? "severity"
          : "NULL::text";

    const result = await this.pool.query<AggregateRow>(
      `WITH bounds AS (
         SELECT
           $1::timestamptz AS from_time,
           $2::timestamptz AS to_time,
           date_bin('1 minute', $1::timestamptz, '1970-01-01T00:00:00Z')
             + CASE
                 WHEN $1::timestamptz = date_bin(
                   '1 minute', $1::timestamptz, '1970-01-01T00:00:00Z'
                 ) THEN interval '0'
                 ELSE interval '1 minute'
               END AS first_full_minute,
           date_bin('1 minute', $2::timestamptz, '1970-01-01T00:00:00Z') AS last_full_minute
       ), combined AS (
         SELECT
           date_bin($3::interval, bucket_start, '1970-01-01T00:00:00Z') AS result_bucket,
           ${groupExpression} AS group_value,
           SUM(event_count)::bigint AS event_count
         FROM minute_dimension_totals, bounds
         WHERE bucket_start >= first_full_minute
           AND bucket_start < last_full_minute
           ${filterSql}
         GROUP BY result_bucket, group_value

         UNION ALL

         SELECT
           date_bin($3::interval, occurred_at, '1970-01-01T00:00:00Z') AS result_bucket,
           ${groupExpression} AS group_value,
           COUNT(*)::bigint AS event_count
         FROM log_events, bounds
         WHERE occurred_at >= from_time
           AND occurred_at < LEAST(to_time, first_full_minute)
           ${filterSql}
         GROUP BY result_bucket, group_value

         UNION ALL

         SELECT
           date_bin($3::interval, occurred_at, '1970-01-01T00:00:00Z') AS result_bucket,
           ${groupExpression} AS group_value,
           COUNT(*)::bigint AS event_count
         FROM log_events, bounds
         WHERE to_time > first_full_minute
           AND occurred_at >= GREATEST(from_time, last_full_minute)
           AND occurred_at < to_time
           ${filterSql}
         GROUP BY result_bucket, group_value
       )
       SELECT
         result_bucket AS bucket_start,
         group_value,
         SUM(event_count)::text AS event_count
       FROM combined
       GROUP BY result_bucket, group_value
       ORDER BY result_bucket ASC, group_value ASC NULLS FIRST`,
      values,
    );

    return result.rows.map((row) => ({
      start: row.bucket_start.toISOString(),
      group: row.group_value,
      count: Number(row.event_count),
    }));
  }
}
