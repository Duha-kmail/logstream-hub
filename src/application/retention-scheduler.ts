export interface RetentionLogger {
  info(details: object, message: string): void;
  error(details: object, message: string): void;
}

export class RetentionScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  public constructor(
    private readonly intervalMinutes: number,
    private readonly cleanup: () => Promise<string[]>,
    private readonly logger: RetentionLogger,
  ) {}

  public async runNow(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const removed = await this.cleanup();
      if (removed.length > 0) {
        this.logger.info({ partitions: removed }, "expired log partitions removed");
      }
    } finally {
      this.running = false;
    }
  }

  public start(): void {
    if (this.timer !== undefined) return;

    this.timer = setInterval(() => {
      void this.runNow().catch((error: unknown) => {
        this.logger.error({ error }, "retention cleanup failed");
      });
    }, this.intervalMinutes * 60_000);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
