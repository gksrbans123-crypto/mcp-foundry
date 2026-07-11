export interface TokenBucketOptions {
  /** Max tokens the bucket can hold — also the burst limit. */
  capacity: number;
  /** Wall-clock time to refill from empty to `capacity`. */
  refillIntervalMs: number;
}

export interface TokenBucketLimiter {
  /** Returns true and consumes one token if the key has capacity, false otherwise. */
  tryConsume(key: string): boolean;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
}

/** Per-key token bucket, refilling continuously rather than in fixed windows. */
export function createTokenBucketLimiter(options: TokenBucketOptions): TokenBucketLimiter {
  const buckets = new Map<string, BucketState>();
  const refillRatePerMs = options.capacity / options.refillIntervalMs;

  return {
    tryConsume(key) {
      const now = Date.now();
      const existing = buckets.get(key);
      const tokens = existing
        ? Math.min(options.capacity, existing.tokens + (now - existing.updatedAt) * refillRatePerMs)
        : options.capacity;

      if (tokens < 1) {
        buckets.set(key, { tokens, updatedAt: now });
        return false;
      }
      buckets.set(key, { tokens: tokens - 1, updatedAt: now });
      return true;
    },
  };
}

export interface RateLimiters {
  /** create_mcp_server / refine_mcp_server / delete_server (plan task #5 §5). */
  mutate: TokenBucketLimiter;
  /** get_job_status / list_my_servers / get_server_details / get_dashboard_link. */
  query: TokenBucketLimiter;
}

const MUTATE_LIMIT_PER_MINUTE = 3;
const QUERY_LIMIT_PER_MINUTE = 30;
const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

export function createRateLimiters(): RateLimiters {
  return {
    mutate: createTokenBucketLimiter({ capacity: MUTATE_LIMIT_PER_MINUTE, refillIntervalMs: ONE_MINUTE_MS }),
    query: createTokenBucketLimiter({ capacity: QUERY_LIMIT_PER_MINUTE, refillIntervalMs: ONE_MINUTE_MS }),
  };
}

// HIGH-2: a caller who never presents X-Owner-Token gets a brand-new user +
// token on every single request, which (a) floods the users table and (b)
// defeats the per-user mutate/query buckets above, since each request's
// userId has never been seen before. This bounds how many *new* identities
// one client (keyed by IP — see auth/middleware.ts) can mint, independent of
// the per-user limiters.
//
// The actual "unlimited mutate calls" exploit is already closed regardless
// of this cap's exact size — auth/middleware.ts gives every anonymous
// request the *same* IP-derived rateLimitKey, so all anonymous mutate calls
// from one address share one 3/min bucket no matter how many identities got
// minted along the way (see create-mcp-server.ts et al). This limiter's
// remaining job is bounding raw users-table growth and anonymous *query*
// spam (query tools aren't given the IP-key treatment, since they're not
// the financial-DoS vector). 100/hour comfortably covers a stateless
// client's natural per-session protocol overhead — each of `initialize`,
// `notifications/initialized`, and every call before a client has saved its
// token is itself a distinct anonymous request, and one MCP session can
// easily spend 3-4 of these before the caller ever sees a token to send
// back — while still bounding a single IP to a small, finite number of
// fresh rows per hour instead of the unbounded rate this replaces.
const ISSUANCE_LIMIT_PER_HOUR = 100;

export function createIssuanceLimiter(): TokenBucketLimiter {
  return createTokenBucketLimiter({ capacity: ISSUANCE_LIMIT_PER_HOUR, refillIntervalMs: ONE_HOUR_MS });
}
