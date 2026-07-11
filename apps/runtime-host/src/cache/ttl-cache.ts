import { CACHE_TTL_MAX_SECONDS } from "@mcp-foundry/spec";

interface Entry {
  value: string;
  expiresAt: number;
}

/**
 * In-memory TTL cache for rendered tool-call markdown. The TTL passed to
 * `set` is always re-capped at CACHE_TTL_MAX_SECONDS here, independently of
 * packages/spec's schema-level cap on `cacheTtlSeconds` — defense in depth
 * against a bug anywhere upstream of this call site.
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry>();

  get(key: string, now: number = Date.now()): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number, now: number = Date.now()): void {
    const cappedTtlSeconds = Math.min(ttlSeconds, CACHE_TTL_MAX_SECONDS);
    if (cappedTtlSeconds <= 0) return;
    this.entries.set(key, { value, expiresAt: now + cappedTtlSeconds * 1000 });
  }

  size(): number {
    return this.entries.size;
  }
}
