# LogStream Hub

LogStream Hub is a TypeScript service for collecting, storing, and exploring structured application logs.

It provides batch ingestion, filtered search, signed cursor pagination, time-bucket aggregation, and partition-based retention on PostgreSQL.

## Quick start

Start the API and PostgreSQL:

```bash
docker compose up --build
```

The API listens on `http://localhost:8080`. Readiness is available at `GET /health`.

## Configuration

| Variable                     | Default                    | Purpose                           |
| ---------------------------- | -------------------------- | --------------------------------- |
| `HOST`                       | `0.0.0.0`                  | HTTP bind address                 |
| `PORT`                       | `8080`                     | HTTP port                         |
| `LOG_LEVEL`                  | `info`                     | Fastify log level                 |
| `POSTGRES_URL`               | local `logstream` database | PostgreSQL connection URL         |
| `POSTGRES_POOL_SIZE`         | `8`                        | Maximum pool connections          |
| `PARTITION_LOOKAHEAD_DAYS`   | `3`                        | Future daily partitions to create |
| `CURSOR_SECRET`              | development value          | HMAC key for pagination cursors   |
| `RETENTION_DAYS`             | `30`                       | Age of partitions retained        |
| `RETENTION_INTERVAL_MINUTES` | `60`                       | Cleanup schedule interval         |
| `INGEST_FLUSH_MS`            | `10`                       | Delay used to combine writes      |
| `INGEST_BATCH_SIZE`          | `5000`                     | Entries per database write        |
| `INGEST_QUEUE_LIMIT`         | `200000`                   | Backpressure queue limit          |
| `INGEST_SYNCHRONOUS_COMMIT`  | `true`                     | Wait for durable WAL commit       |

## Log format

Each incoming log will use the following structure:

```json
{
  "timestamp": "2026-08-12T09:15:00.000Z",
  "level": "info",
  "service": "checkout",
  "message": "order submitted",
  "attributes": {
    "orderId": "A-104",
    "attempt": 1
  }
}
```

Supported levels are `debug`, `info`, `warn`, and `error`. Attribute values are limited to strings, finite numbers, and booleans.

## Ingest logs

`POST /logs` accepts a `logs` array. Valid entries are stored together in one PostgreSQL transaction, while invalid entries are returned with their original array index.

```json
{
  "accepted": 1,
  "rejected": [{ "index": 1, "reason": "level must be one of debug, info, warn, or error" }]
}
```

If every entry is rejected, the endpoint returns `400`. A partially accepted batch returns `200`.

Concurrent ingestion requests are combined into larger PostgreSQL writes. When the bounded queue is full, the service returns `503` instead of allowing unbounded memory growth. Compose disables synchronous commit for benchmark-oriented local runs; set `INGEST_SYNCHRONOUS_COMMIT=true` when acknowledging a write only after its WAL record is durable.

## Search logs

`GET /logs` returns the newest events first and supports `service`, `level`, `since`, `until`, `q`, `attr.<key>`, and `limit` filters. Results use signed cursor pagination instead of offsets.

```text
GET /logs?service=checkout&level=error&limit=50
```

Pass the returned `next_cursor` value as `cursor` to request the next page. Cursor signatures use `CURSOR_SECRET`.

## Aggregate logs

`GET /logs/aggregate` groups matching events into time buckets. The `since`, `until`, and `bucket` parameters are required. Supported buckets are `1m`, `5m`, `1h`, and `1d`.

```text
GET /logs/aggregate?since=2026-08-12T00:00:00Z&until=2026-08-13T00:00:00Z&bucket=1h&group_by=service
```

Use `group_by=service` or `group_by=level` to split each bucket. The endpoint also accepts the service, level, message, and attribute filters used by log search.

## Database foundation

PostgreSQL stores log events in a table partitioned by occurrence time. The initial schema includes indexes for source, severity, metadata equality, and message substring searches.

Database access is configured with `POSTGRES_URL` and `POSTGRES_POOL_SIZE`. Pending SQL migrations can be applied with:

```bash
npm run migrate
```

Start the local PostgreSQL instance with:

```bash
docker compose up -d database
```

On startup, the service applies pending migrations and creates the current and upcoming daily partitions. The health endpoint reports `503` until the database schema is available.

## Data retention

Old data is removed by dropping complete daily partitions instead of deleting rows individually. `RETENTION_DAYS` controls the age limit and defaults to 30 days. Cleanup runs at startup and then every `RETENTION_INTERVAL_MINUTES`.

## Tests

Unit tests cover log validation, query parsing, signed cursors, and retention scheduling:

```bash
npm test
```

Run the complete local verification set with:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Containerized service

Build and start the API together with PostgreSQL:

```bash
docker compose up --build
```

The API is exposed on port `8080`, and Compose waits for PostgreSQL readiness before starting it. The runtime image uses a non-root user and contains only production dependencies, compiled files, and database migrations.

## Sample data and load checks

With the service running, generate a small sample dataset or run a client-side workload:

```bash
npm run seed
npm run loadtest
```

Use `SEED_EVENTS`, `SEED_BATCH_SIZE`, `LOAD_EVENTS`, `LOAD_BATCH_SIZE`, and `LOAD_WORKERS` to adjust volume. `LOGSTREAM_URL` changes the target API address.

## Design documentation

See [Architecture](docs/architecture.md) for the source layout, storage model, request paths, lifecycle, and security decisions. See [Performance tuning](docs/performance.md) for the benchmark diagnosis, changes, measured results, and durability trade-off.
