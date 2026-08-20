import type { Clock } from "@server/http";

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_LOGIN_ATTEMPTS = 5;

export interface RateLimiterOptions {
  windowMs?: number;
  maxAttempts?: number;
  clock?: Clock;
}

/**
 * Sliding-window limiter keyed by client IP.
 *
 * Only *failed* logins are recorded. Counting successes too means a handful of
 * legitimate logins locks the owner out of their own dashboard, while doing
 * nothing to slow an attacker down — brute force is failures by definition.
 */
export class RateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly now: Clock;

  constructor({
    windowMs = RATE_LIMIT_WINDOW_MS,
    maxAttempts = MAX_LOGIN_ATTEMPTS,
    clock = Date.now
  }: RateLimiterOptions = {}) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.now = clock;
  }

  isLimited(key: string): boolean {
    return this.recent(key).length >= this.maxAttempts;
  }

  recordFailure(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.attempts.set(key, recent);
  }

  /** Clears the budget for a key; called after a successful login. */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  remaining(key: string): number {
    return Math.max(0, this.maxAttempts - this.recent(key).length);
  }

  gc(): void {
    for (const key of this.attempts.keys()) {
      const recent = this.recent(key);
      if (recent.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, recent);
      }
    }
  }

  private recent(key: string): number[] {
    const now = this.now();
    return (this.attempts.get(key) ?? []).filter((t) => now - t < this.windowMs);
  }
}
