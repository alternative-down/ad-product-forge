/**
 * Unit tests for utils/time.ts.
 * TimeProvider and currentTimeMs — zero prior coverage.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createTimeProvider, currentTimeMs, TimeProvider } from './time';

// ─── createTimeProvider ────────────────────────────────────────────────────

describe('createTimeProvider', () => {
  it('returns TimeProvider with default Date.now', () => {
    const provider = createTimeProvider();
    const now = Date.now();
    expect(provider.now()).toBeGreaterThanOrEqual(now - 1000);
    expect(provider.now()).toBeLessThanOrEqual(now + 1000);
  });

  it('returns TimeProvider with custom function', () => {
    const fixedTime = 1700000000000;
    const provider = createTimeProvider(() => fixedTime);
    expect(provider.now()).toBe(fixedTime);
  });

  it('multiple calls return consistent value from custom fn', () => {
    let counter = 100;
    const provider = createTimeProvider(() => ++counter);
    expect(provider.now()).toBe(101);
    expect(provider.now()).toBe(102);
    expect(provider.now()).toBe(103);
  });
});

// ─── module-level currentTimeMs ─────────────────────────────────────────────

describe('currentTimeMs', () => {
  // Since we can't modify module-level _currentTimeMs, we just test that it
  // returns a reasonable value close to Date.now()
  it('returns a value close to Date.now()', () => {
    const before = Date.now();
    const result = currentTimeMs();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after + 100);
  });

  it('returns monotonically increasing values', () => {
    const first = currentTimeMs();
    const second = currentTimeMs();
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

// ─── TimeProvider type shape ───────────────────────────────────────────────

describe('TimeProvider interface', () => {
  it('satisfies TimeProvider interface shape', () => {
    const provider: TimeProvider = createTimeProvider(() => 123456789);
    expect(typeof provider.now).toBe('function');
    expect(provider.now()).toBe(123456789);
  });
});
