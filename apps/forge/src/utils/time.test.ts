/**
 * Unit tests for utils/time.ts — TimeProvider and time mocking utilities.
 * Zero prior coverage for these 4 exported functions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTimeProvider,
  currentTimeMs,
  setCurrentTimeMs,
  resetCurrentTimeMs,
  type TimeProvider,
} from './time';

describe('createTimeProvider', () => {
  it('creates a TimeProvider with default Date.now', () => {
    const provider = createTimeProvider();
    expect(typeof provider.now).toBe('function');
  });

  it('creates a TimeProvider with custom now function', () => {
    const provider = createTimeProvider(() => 999);
    expect(provider.now()).toBe(999);
  });

  it('now is called on each invocation', () => {
    let counter = 100;
    const provider = createTimeProvider(() => ++counter);
    expect(provider.now()).toBe(101);
    expect(provider.now()).toBe(102);
  });
});

describe('TimeProvider interface usage', () => {
  it('satisfies TimeProvider type', () => {
    const provider: TimeProvider = createTimeProvider(() => 5000);
    expect(typeof provider.now).toBe('function');
    expect(provider.now()).toBe(5000);
  });
});

describe('currentTimeMs', () => {
  afterEach(() => {
    resetCurrentTimeMs();
  });

  it('returns a number by default', () => {
    const t = currentTimeMs();
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThan(0);
  });

  it('is overridable by setCurrentTimeMs', () => {
    setCurrentTimeMs(() => 1234567890);
    expect(currentTimeMs()).toBe(1234567890);
  });

  it('multiple overrides stack correctly', () => {
    setCurrentTimeMs(() => 111);
    expect(currentTimeMs()).toBe(111);
    setCurrentTimeMs(() => 222);
    expect(currentTimeMs()).toBe(222);
  });
});

describe('setCurrentTimeMs', () => {
  afterEach(() => {
    resetCurrentTimeMs();
  });

  it('overrides the time source', () => {
    setCurrentTimeMs(() => 42);
    expect(currentTimeMs()).toBe(42);
  });

  it('works with a fixed date string', () => {
    setCurrentTimeMs(() => new Date('2020-01-01').getTime());
    expect(currentTimeMs()).toBe(new Date('2020-01-01').getTime());
  });
});

describe('resetCurrentTimeMs', () => {
  it('restores to real Date.now after override', () => {
    setCurrentTimeMs(() => 999999);
    resetCurrentTimeMs();
    const t = currentTimeMs();
    // After reset, should return real system time (a recent timestamp)
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThan(0);
    // Should NOT be 999999 anymore
    expect(t).not.toBe(999999);
  });

  it('is safe to call even without prior override', () => {
    resetCurrentTimeMs();
    resetCurrentTimeMs();
    expect(currentTimeMs()).toBeGreaterThan(0);
  });

  it('reset works inside afterEach without error', () => {
    // This test itself demonstrates the use case
    setCurrentTimeMs(() => 777);
    resetCurrentTimeMs();
    const t = currentTimeMs();
    expect(t).toBeGreaterThan(0);
    expect(t).not.toBe(777);
  });
});