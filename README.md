# LogStream Hub

LogStream Hub is a TypeScript service for collecting, storing, and exploring structured application logs.

The project will be built incrementally, with each milestone documented in its own commit.

## Current milestone

The service exposes a lightweight health endpoint:

```text
GET /health
```

Runtime settings can be provided through `HOST`, `PORT`, and `LOG_LEVEL`.

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

## Database foundation

PostgreSQL stores log events in a table partitioned by occurrence time. The initial schema includes indexes for source, severity, metadata equality, and message substring searches.

Database access is configured with `POSTGRES_URL` and `POSTGRES_POOL_SIZE`. Pending SQL migrations can be applied with:

```bash
npm run migrate
```
