export interface CircuitBreakerOptions {
  /** Consecutive failures/timeouts before the breaker opens. */
  failureThreshold: number;
  /** How long the breaker stays open once tripped. */
  cooldownMs: number;
}

interface BreakerState {
  consecutiveFailures: number;
  openUntil: number | null;
}

const CLOSED: BreakerState = { consecutiveFailures: 0, openUntil: null };

/**
 * Per-key (per-slug) circuit breaker (plan §5.2 "per-tenant circuit
 * breaker — noisy neighbor 격리"). MVP scope: closed/open only — once
 * `cooldownMs` elapses the breaker closes and resets rather than admitting
 * a single half-open trial request first. A tenant whose upstream is
 * repeatedly failing/timing out gets a fast, sanitized rejection instead
 * of every request separately paying the full timeout cost, and other
 * tenants sharing this process are unaffected.
 */
export class CircuitBreakerRegistry {
  private readonly states = new Map<string, BreakerState>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  isOpen(key: string, now: number = Date.now()): boolean {
    const state = this.states.get(key);
    if (!state?.openUntil) return false;
    if (now >= state.openUntil) {
      this.states.set(key, CLOSED);
      return false;
    }
    return true;
  }

  recordSuccess(key: string): void {
    this.states.set(key, CLOSED);
  }

  recordFailure(key: string, now: number = Date.now()): void {
    const state = this.states.get(key) ?? CLOSED;
    const consecutiveFailures = state.consecutiveFailures + 1;
    const openUntil = consecutiveFailures >= this.options.failureThreshold ? now + this.options.cooldownMs : null;
    this.states.set(key, { consecutiveFailures, openUntil });
  }
}
