# Architecture

LogStream Hub separates transport, application rules, domain types, and PostgreSQL concerns so each layer can evolve independently.

```text
HTTP routes
    |
    v
Application validation and query parsing
    |
    v
PostgreSQL readers, writers, aggregation, and retention
    |
    v
Daily partitioned log_events table
```

## Source layout

- `src/transport` owns Fastify routes and HTTP responses.
- `src/application` validates requests, parses filters, signs cursors, and schedules retention.
- `src/domain` defines the normalized log model.
- `src/infrastructure/postgres` owns persistence, SQL queries, migrations, partitions, and cleanup.
- `src/commands` contains migration, seed, and load-check entry points.
- `database/migrations` contains ordered SQL schema changes.

## Storage model

`log_events` is range-partitioned by `occurred_at`. Each daily child table inherits indexes from the partitioned parent. The composite primary key `(occurred_at, event_id)` supports deterministic newest-first pagination and satisfies PostgreSQL's partitioned uniqueness rules.

Original attributes are preserved in `metadata`. A second JSONB value, `searchable_metadata`, converts primitive values to strings so API filters behave consistently for strings, numbers, and booleans.

## Write path

The ingestion endpoint validates every entry independently. Accepted entries are inserted with one parameterized `UNNEST` statement inside a transaction. Required daily partitions are created under an advisory transaction lock before the insert. Invalid entries retain their original batch position in the response.

## Read path

Search filters are converted to parameterized SQL predicates. Results are ordered by `(occurred_at DESC, event_id DESC)`. Pagination uses an HMAC-signed cursor containing the last row's timestamp and identifier, avoiding the cost and consistency problems of deep offsets.

Aggregation uses PostgreSQL `date_bin` with a strictly allow-listed interval and optional grouping by source or severity. All filter values remain query parameters.

## Lifecycle

At startup the service applies ordered migrations, creates current and upcoming partitions, performs retention cleanup, and then begins listening. `/health` reports readiness only while the required schema is reachable. Shutdown stops the retention timer, closes Fastify, and drains the PostgreSQL pool.

Retention drops whole expired partitions under an advisory lock. This avoids large row deletes and table bloat, with expiration granularity of one UTC day.

## Security boundaries

- SQL values are parameterized.
- Dynamic interval and grouping expressions come from fixed allow lists.
- Generated partition identifiers and boundaries are validated before DDL.
- Search cursors are signed and verified with constant-time signature comparison.
- NUL characters and nested attribute values are rejected at the API boundary.
- The production container runs as an unprivileged user.
