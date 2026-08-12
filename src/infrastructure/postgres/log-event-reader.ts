import type { Metadata, Severity } from "../../domain/log-entry.js";
import { createLogCursor } from "../../application/log-cursor.js";
import type { LogSearchCriteria } from "../../application/read-log-query.js";
import type { DatabasePool } from "./connection.js";

interface LogEventRow {
  event_id: string;
  occurred_at: Date;
  severity: Severity;
  source_name: string;
  content: string;
  metadata: Metadata;
}

export interface StoredLogEvent {
  id: string;
  timestamp: string;
  level: Severity;
  service: string;
  message: string;
  attributes: Metadata;
}

export interface LogPage {
  logs: StoredLogEvent[];
  nextCursor: string | null;
}

function addCondition(
  conditions: string[],
  values: unknown[],
  expression: string,
  value: unknown,
): void {
  values.push(value);
  conditions.push(expression.replace("?", `$${values.length}`));
}

function escapeLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&").toLowerCase()}%`;
}

export class PostgresLogEventReader {
  public constructor(
    private readonly pool: DatabasePool,
    private readonly cursorSecret: string,
  ) {}

  public async find(criteria: LogSearchCriteria): Promise<LogPage> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (criteria.source !== undefined) {
      addCondition(conditions, values, "source_name = ?", criteria.source);
    }
    if (criteria.severity !== undefined) {
      addCondition(conditions, values, "severity = ?", criteria.severity);
    }
    if (criteria.from !== undefined) {
      addCondition(conditions, values, "occurred_at >= ?::timestamptz", criteria.from.toISOString());
    }
    if (criteria.to !== undefined) {
      addCondition(conditions, values, "occurred_at < ?::timestamptz", criteria.to.toISOString());
    }
    if (Object.keys(criteria.metadata).length > 0) {
      addCondition(
        conditions,
        values,
        "searchable_metadata @> ?::jsonb",
        JSON.stringify(criteria.metadata),
      );
    }
    if (criteria.phrase !== undefined) {
      addCondition(conditions, values, "lower(content) LIKE ? ESCAPE '\\'", escapeLike(criteria.phrase));
    }
    if (criteria.cursor !== undefined) {
      values.push(criteria.cursor.occurredAt, criteria.cursor.eventId);
      conditions.push(
        `(occurred_at, event_id) < ($${values.length - 1}::timestamptz, $${values.length}::bigint)`,
      );
    }

    values.push(criteria.pageSize + 1);
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const result = await this.pool.query<LogEventRow>(
      `SELECT event_id::text, occurred_at, severity, source_name, content, metadata
       FROM log_events
       ${where}
       ORDER BY occurred_at DESC, event_id DESC
       LIMIT $${values.length}`,
      values,
    );

    const hasNextPage = result.rows.length > criteria.pageSize;
    const pageRows = result.rows.slice(0, criteria.pageSize);
    const lastRow = pageRows.at(-1);

    return {
      logs: pageRows.map((row) => ({
        id: row.event_id,
        timestamp: row.occurred_at.toISOString(),
        level: row.severity,
        service: row.source_name,
        message: row.content,
        attributes: row.metadata,
      })),
      nextCursor:
        hasNextPage && lastRow !== undefined
          ? createLogCursor(
              { occurredAt: lastRow.occurred_at.toISOString(), eventId: lastRow.event_id },
              this.cursorSecret,
            )
          : null,
    };
  }
}
