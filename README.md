# LogStream Hub

LogStream Hub is a TypeScript service for collecting, storing, and exploring structured application logs.

The project will be built incrementally, with each milestone documented in its own commit.

## Current milestone

The service exposes a lightweight health endpoint:

```text
GET /health
```

Runtime settings can be provided through `HOST`, `PORT`, and `LOG_LEVEL`.
