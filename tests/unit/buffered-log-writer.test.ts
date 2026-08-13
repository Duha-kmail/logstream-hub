import { describe, expect, it, vi } from "vitest";
import {
  BufferedLogWriter,
  IngestionCapacityError,
} from "../../src/application/buffered-log-writer.js";
import type { LogEntry } from "../../src/domain/log-entry.js";

function entry(id: number): LogEntry {
  return {
    occurredAt: new Date(`2026-08-13T00:00:${String(id).padStart(2, "0")}.000Z`),
    severity: "info",
    source: "test",
    content: `event ${id}`,
    metadata: {},
  };
}

describe("buffered log writer", () => {
  it("combines concurrent requests into one destination write", async () => {
    const appendMany = vi.fn(async (entries: LogEntry[]) => entries.length);
    const writer = new BufferedLogWriter(
      { appendMany },
      { flushIntervalMs: 1_000, maximumBatchEntries: 100, maximumQueuedEntries: 1_000 },
    );

    const first = writer.appendMany([entry(1), entry(2)]);
    const second = writer.appendMany([entry(3)]);
    await writer.flush();

    await expect(first).resolves.toBe(2);
    await expect(second).resolves.toBe(1);
    expect(appendMany).toHaveBeenCalledOnce();
    expect(appendMany.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("rejects new writes when the bounded queue is full", () => {
    const writer = new BufferedLogWriter(
      { appendMany: vi.fn() },
      { flushIntervalMs: 1_000, maximumBatchEntries: 100, maximumQueuedEntries: 2 },
    );

    void writer.appendMany([entry(1), entry(2)]);
    expect(() => writer.appendMany([entry(3)])).toThrow(IngestionCapacityError);
  });

  it("flushes queued requests before closing", async () => {
    const appendMany = vi.fn(async (entries: LogEntry[]) => entries.length);
    const writer = new BufferedLogWriter(
      { appendMany },
      { flushIntervalMs: 1_000, maximumBatchEntries: 100, maximumQueuedEntries: 1_000 },
    );

    const result = writer.appendMany([entry(1)]);
    await writer.close();

    await expect(result).resolves.toBe(1);
    expect(appendMany).toHaveBeenCalledOnce();
    expect(() => writer.appendMany([entry(2)])).toThrow("ingestion is shutting down");
  });
});
