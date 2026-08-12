import { endpoint, positiveInteger } from "../tools/command-options.js";
import { createSampleBatch } from "../tools/sample-logs.js";

const baseUrl = endpoint(process.env);
const totalEvents = positiveInteger(process.env, "SEED_EVENTS", 5_000, 5_000_000);
const batchSize = positiveInteger(process.env, "SEED_BATCH_SIZE", 250, 5_000);

let acceptedEvents = 0;
const startedAt = performance.now();

for (let offset = 0; offset < totalEvents; offset += batchSize) {
  const size = Math.min(batchSize, totalEvents - offset);
  const response = await fetch(`${baseUrl}/logs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ logs: createSampleBatch(offset, size) }),
  });

  if (!response.ok) {
    throw new Error(`seed request failed with ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { accepted: number };
  acceptedEvents += result.accepted;
}

const elapsedSeconds = (performance.now() - startedAt) / 1_000;
console.log(
  JSON.stringify(
    {
      endpoint: baseUrl,
      requested: totalEvents,
      accepted: acceptedEvents,
      batchSize,
      elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      eventsPerSecond: Math.round(acceptedEvents / elapsedSeconds),
    },
    null,
    2,
  ),
);
