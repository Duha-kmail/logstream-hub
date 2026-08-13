import { endpoint, positiveInteger } from "../tools/command-options.js";
import { createSampleBatch } from "../tools/sample-logs.js";

interface RequestSample {
  durationMs: number;
  successful: boolean;
}

const baseUrl = endpoint(process.env);
const totalEvents = positiveInteger(process.env, "LOAD_EVENTS", 10_000, 10_000_000);
const batchSize = positiveInteger(process.env, "LOAD_BATCH_SIZE", 250, 5_000);
const workers = positiveInteger(process.env, "LOAD_WORKERS", 4, 32);

const ingestion: RequestSample[] = [];
const searches: RequestSample[] = [];
const aggregations: RequestSample[] = [];
let nextOffset = 0;

function percentile(samples: RequestSample[], percentileValue: number): number {
  if (samples.length === 0) return 0;
  const sorted = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const position = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return Number((sorted[position] ?? 0).toFixed(2));
}

async function measure(url: string, options: RequestInit | undefined): Promise<RequestSample> {
  const start = performance.now();
  const response = await fetch(url, options);
  const sample = { durationMs: performance.now() - start, successful: response.ok };
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return sample;
}

async function ingestionWorker(): Promise<void> {
  while (nextOffset < totalEvents) {
    const offset = nextOffset;
    nextOffset += batchSize;
    const size = Math.min(batchSize, totalEvents - offset);
    ingestion.push(
      await measure(`${baseUrl}/logs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logs: createSampleBatch(offset, size) }),
      }),
    );
  }
}

async function sampleReads(): Promise<void> {
  const since = encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString());
  const until = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());

  const [search, aggregate] = await Promise.all([
    measure(`${baseUrl}/logs?service=orders&limit=100&q=completed`, undefined),
    measure(
      `${baseUrl}/logs/aggregate?since=${since}&until=${until}&bucket=1h&group_by=service`,
      undefined,
    ),
  ]);
  searches.push(search);
  aggregations.push(aggregate);
}

const startedAt = performance.now();
await sampleReads();
await Promise.all(Array.from({ length: workers }, () => ingestionWorker()));
await sampleReads();
const elapsedSeconds = (performance.now() - startedAt) / 1_000;
const allSamples = [...ingestion, ...searches, ...aggregations];
const failures = allSamples.filter((sample) => !sample.successful).length;

console.log(
  JSON.stringify(
    {
      endpoint: baseUrl,
      events: totalEvents,
      batchSize,
      workers,
      elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      eventsPerSecond: Math.round(totalEvents / elapsedSeconds),
      requestErrorRate: allSamples.length === 0 ? 0 : failures / allSamples.length,
      ingestionLatencyMs: { p50: percentile(ingestion, 50), p95: percentile(ingestion, 95) },
      searchLatencyMs: { p50: percentile(searches, 50), p95: percentile(searches, 95) },
      aggregationLatencyMs: {
        p50: percentile(aggregations, 50),
        p95: percentile(aggregations, 95),
      },
    },
    null,
    2,
  ),
);
