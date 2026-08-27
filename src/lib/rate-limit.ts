/**
 * A fixed-window rate limiter.
 *
 * Deliberately small and in-memory. It exists to stop one obvious failure
 * mode: a public deployment with an API key configured, where anyone who
 * finds the URL can spend the operator's credit one Claude call at a time.
 *
 * What it is not: protection against a distributed attacker. State lives in
 * the process, so on a platform that runs several instances the effective
 * allowance is the limit multiplied by the instance count. A deployment that
 * needs a real guarantee wants a shared store — Redis, Durable Objects,
 * whatever the host offers — and this module's shape is meant to make that
 * swap a small one.
 */

export interface RateLimitConfig {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window, after accounting for this one. */
  remaining: number;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfterSeconds: number;
  /** When the current window ends, as a millisecond timestamp. */
  resetAt: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #config: RateLimitConfig;
  readonly #now: () => number;

  /** The clock is injectable so the behaviour can be tested without waiting. */
  constructor(config: RateLimitConfig, now: () => number = Date.now) {
    this.#config = config;
    this.#now = now;
  }

  check(key: string): RateLimitResult {
    const now = this.#now();
    this.#prune(now);

    const existing = this.#windows.get(key);
    const window =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + this.#config.windowMs };

    window.count += 1;
    this.#windows.set(key, window);

    const allowed = window.count <= this.#config.limit;
    return {
      allowed,
      remaining: Math.max(0, this.#config.limit - window.count),
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      resetAt: window.resetAt,
    };
  }

  /**
   * Drop expired windows.
   *
   * Without this the map grows once per distinct client forever, which turns
   * a rate limiter into a memory leak on any long-lived process.
   */
  #prune(now: number): void {
    for (const [key, window] of this.#windows) {
      if (window.resetAt <= now) this.#windows.delete(key);
    }
  }

  /** Test seam. */
  get size(): number {
    return this.#windows.size;
  }
}

/**
 * Identify the caller.
 *
 * x-forwarded-for is a client-supplied header and trivially spoofed, so this
 * is a courtesy limit rather than a security boundary — it stops accidental
 * and casual abuse, not a determined attacker. The leftmost entry is the
 * original client where the header is set by a trusted proxy.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Per-caller allowance. */
export const extractionLimiter = new FixedWindowRateLimiter({
  limit: envInt('EXTRACT_RATE_LIMIT', 10),
  windowMs: envInt('EXTRACT_RATE_WINDOW_MS', 60 * 60 * 1000),
});

/**
 * A ceiling across all callers.
 *
 * The per-caller limit does nothing against many clients each staying under
 * it. This is the one that actually bounds the bill.
 */
export const globalExtractionLimiter = new FixedWindowRateLimiter({
  limit: envInt('EXTRACT_RATE_LIMIT_GLOBAL', 100),
  windowMs: envInt('EXTRACT_RATE_WINDOW_MS', 60 * 60 * 1000),
});

export const GLOBAL_KEY = '__all__';
