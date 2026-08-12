import { describe, expect, it, vi } from "vitest";
import { RetentionScheduler } from "../../src/application/retention-scheduler.js";

describe("retention scheduler", () => {
  it("runs cleanup and reports removed partitions", async () => {
    const cleanup = vi.fn().mockResolvedValue(["log_events_20260701"]);
    const logger = { info: vi.fn(), error: vi.fn() };
    const scheduler = new RetentionScheduler(60, cleanup, logger);

    await scheduler.runNow();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      { partitions: ["log_events_20260701"] },
      "expired log partitions removed",
    );
  });

  it("does not overlap cleanup executions", async () => {
    let finish: ((partitions: string[]) => void) | undefined;
    const cleanup = vi.fn(
      () => new Promise<string[]>((resolve) => {
        finish = resolve;
      }),
    );
    const scheduler = new RetentionScheduler(60, cleanup, {
      info: vi.fn(),
      error: vi.fn(),
    });

    const firstRun = scheduler.runNow();
    await scheduler.runNow();
    finish?.([]);
    await firstRun;

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
