import type { LogEntry } from "../domain/log-entry.js";
import type { LogEventWriter } from "./ingest-log-batch.js";

interface PendingWrite {
  entries: LogEntry[];
  resolve: (accepted: number) => void;
  reject: (error: unknown) => void;
}

export interface WriteBufferOptions {
  flushIntervalMs: number;
  maximumBatchEntries: number;
  maximumQueuedEntries: number;
}

export class IngestionCapacityError extends Error {
  public readonly statusCode = 503;
}

export class BufferedLogWriter implements LogEventWriter {
  private readonly pending: PendingWrite[] = [];
  private queuedEntries = 0;
  private flushTimer: NodeJS.Timeout | undefined;
  private activeFlush: Promise<void> | undefined;
  private closed = false;

  public constructor(
    private readonly destination: LogEventWriter,
    private readonly options: WriteBufferOptions,
  ) {}

  public appendMany(entries: LogEntry[]): Promise<number> {
    if (this.closed) throw new IngestionCapacityError("ingestion is shutting down");
    if (entries.length === 0) return Promise.resolve(0);
    if (this.queuedEntries + entries.length > this.options.maximumQueuedEntries) {
      throw new IngestionCapacityError("ingestion queue is full");
    }

    const result = new Promise<number>((resolve, reject) => {
      this.pending.push({ entries, resolve, reject });
      this.queuedEntries += entries.length;
    });

    if (this.queuedEntries >= this.options.maximumBatchEntries) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }

    return result;
  }

  public async flush(): Promise<void> {
    if (this.activeFlush !== undefined) return this.activeFlush;
    this.clearFlushTimer();

    this.activeFlush = this.drainQueue().finally(() => {
      this.activeFlush = undefined;
      if (this.pending.length > 0) this.scheduleFlush();
    });
    return this.activeFlush;
  }

  public async close(): Promise<void> {
    this.closed = true;
    this.clearFlushTimer();

    while (this.pending.length > 0 || this.activeFlush !== undefined) {
      await this.flush();
    }
  }

  public metrics(): { queuedEntries: number; queuedRequests: number; flushing: boolean } {
    return {
      queuedEntries: this.queuedEntries,
      queuedRequests: this.pending.length,
      flushing: this.activeFlush !== undefined,
    };
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined || this.activeFlush !== undefined) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, this.options.flushIntervalMs);
    this.flushTimer.unref();
  }

  private clearFlushTimer(): void {
    if (this.flushTimer === undefined) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
  }

  private async drainQueue(): Promise<void> {
    while (this.pending.length > 0) {
      const writes = this.takeBatch();
      const combinedEntries = writes.flatMap((write) => write.entries);

      try {
        await this.destination.appendMany(combinedEntries);
        for (const write of writes) write.resolve(write.entries.length);
      } catch (error) {
        for (const write of writes) write.reject(error);
      }
    }
  }

  private takeBatch(): PendingWrite[] {
    const batch: PendingWrite[] = [];
    let entryCount = 0;

    while (this.pending.length > 0) {
      const next = this.pending[0];
      if (next === undefined) break;
      if (batch.length > 0 && entryCount + next.entries.length > this.options.maximumBatchEntries) {
        break;
      }

      this.pending.shift();
      batch.push(next);
      entryCount += next.entries.length;
      this.queuedEntries -= next.entries.length;
    }

    return batch;
  }
}
