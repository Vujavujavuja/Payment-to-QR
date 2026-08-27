import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter, clientKeyFromHeaders } from './rate-limit';

/** A clock the test drives, so nothing here waits on real time. */
function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('FixedWindowRateLimiter', () => {
  it('allows exactly the configured number of requests', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 3, windowMs: 1000 }, clock().now);
    expect([1, 2, 3].map(() => limiter.check('a').allowed)).toEqual([true, true, true]);
  });

  it('blocks the request after the limit', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1000 }, clock().now);
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('counts down the remaining allowance', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 3, windowMs: 1000 }, clock().now);
    expect(limiter.check('a').remaining).toBe(2);
    expect(limiter.check('a').remaining).toBe(1);
    expect(limiter.check('a').remaining).toBe(0);
  });

  it('never reports a negative allowance once over the limit', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000 }, clock().now);
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').remaining).toBe(0);
  });

  it('keeps callers independent of one another', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000 }, clock().now);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('starts a fresh window once the old one expires', () => {
    const c = clock();
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000 }, c.now);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    c.advance(1001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reports a retry delay that is never zero', () => {
    const c = clock();
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000 }, c.now);
    limiter.check('a');
    // 1ms left in the window still has to round up to a whole second, or a
    // client reading Retry-After: 0 would retry straight into another refusal.
    c.advance(999);
    expect(limiter.check('a').retryAfterSeconds).toBe(1);
  });

  it('does not grow without bound as callers come and go', () => {
    const c = clock();
    const limiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 1000 }, c.now);
    for (let i = 0; i < 500; i++) limiter.check(`caller-${i}`);
    expect(limiter.size).toBe(500);
    // Every window has expired; the next check should sweep them.
    c.advance(1001);
    limiter.check('someone-else');
    expect(limiter.size).toBe(1);
  });
});

describe('clientKeyFromHeaders', () => {
  it('takes the leftmost x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' });
    expect(clientKeyFromHeaders(headers)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip', () => {
    expect(clientKeyFromHeaders(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('groups callers it cannot identify rather than letting them through', () => {
    // They share one bucket, which is the conservative choice: an
    // unidentifiable flood is throttled instead of being unlimited.
    expect(clientKeyFromHeaders(new Headers())).toBe('unknown');
  });

  it('ignores an empty forwarded header', () => {
    const headers = new Headers({ 'x-forwarded-for': '  ', 'x-real-ip': '203.0.113.4' });
    expect(clientKeyFromHeaders(headers)).toBe('203.0.113.4');
  });
});
