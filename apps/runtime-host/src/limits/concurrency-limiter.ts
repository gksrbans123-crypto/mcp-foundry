/**
 * Per-key (per-tenant/slug) concurrency cap (plan §5.2 "테넌트별 동시성
 * 상한") — bounds how many tool executions for a given slug may be
 * in-flight at once, so one busy/slow tenant can't starve others sharing
 * this process. `acquire` resolves once a slot is available; the caller
 * must invoke the returned release function exactly once, typically from a
 * `finally` block.
 */
export class ConcurrencyLimiter {
  private readonly active = new Map<string, number>();
  private readonly waiters = new Map<string, Array<() => void>>();

  constructor(private readonly maxConcurrent: number) {}

  async acquire(key: string): Promise<() => void> {
    const current = this.active.get(key) ?? 0;
    if (current < this.maxConcurrent) {
      this.active.set(key, current + 1);
      return () => this.release(key);
    }

    return new Promise((resolve) => {
      const queue = this.waiters.get(key) ?? [];
      queue.push(() => {
        this.active.set(key, (this.active.get(key) ?? 0) + 1);
        resolve(() => this.release(key));
      });
      this.waiters.set(key, queue);
    });
  }

  activeCount(key: string): number {
    return this.active.get(key) ?? 0;
  }

  queuedCount(key: string): number {
    return this.waiters.get(key)?.length ?? 0;
  }

  private release(key: string): void {
    const current = this.active.get(key) ?? 0;
    this.active.set(key, Math.max(0, current - 1));

    const queue = this.waiters.get(key);
    const next = queue?.shift();
    if (next) next();
  }
}
