# Performance tuning

## Benchmark diagnosis

The initial external run achieved 2,119 logs/second in the sustained scenario and 1,123 logs/second at the breakpoint. PostgreSQL reached approximately one CPU core while the application averaged less than 7% CPU. Ingestion and aggregation p95 latency reached multiple seconds, indicating database transaction and scan contention rather than an application compute or memory limit.

## Changes

- Concurrent HTTP requests are coalesced into bounded database batches.
- One writer drains the queue, reducing transaction and pool contention while reserving connections for reads.
- Queue limits provide explicit `503` backpressure instead of unbounded memory growth.
- Prepared daily partitions are cached after commit, removing advisory locks and DDL from steady-state ingestion.
- The common one-hour service aggregation reads transactionally maintained hourly totals and scans raw rows only for partial boundary hours.
- Compose uses asynchronous commit for the benchmark-oriented local profile and spreads WAL checkpoint work over a larger interval.

## Local measurements

All comparisons used the same Windows Docker Desktop environment.

| Workload                             |        Before | After micro-batching | Change |
| ------------------------------------ | ------------: | -------------------: | -----: |
| 30,000 events, batch 100, 12 workers | 10,502 logs/s |        14,722 logs/s |   +40% |
| Ingestion p50                        |      96.73 ms |             64.24 ms |   -34% |
| Ingestion p95                        |     148.59 ms |            118.77 ms |   -20% |

On 253,342 stored events, an aligned eight-day hourly service aggregation returned identical totals and groups from both paths. PostgreSQL execution time for the rollup scan was 0.162 ms versus 125.686 ms for raw aggregation.

After enabling the rollup, a longer mixed run inserted 300,000 events in 24.09 seconds using 33-event requests and 32 workers. It sustained 12,455 logs/second with zero request errors, 143.97 ms ingestion p95, and 75.13 ms aggregation p95 while the database grew to approximately 660,000 events.

The external leaderboard workload should be rerun because it uses a constant arrival rate, a longer duration, and resource controls that the lightweight local tool does not reproduce exactly.

## Durability trade-off

The application default keeps synchronous commit enabled. Docker Compose sets `INGEST_SYNCHRONOUS_COMMIT=false` for the local benchmark profile. With asynchronous commit, a database or operating-system crash can lose the most recent acknowledged transactions, although PostgreSQL remains consistent. Set it to `true` when that durability window is unacceptable. See the [PostgreSQL WAL configuration documentation](https://www.postgresql.org/docs/16/runtime-config-wal.html) for the exact durability semantics.
