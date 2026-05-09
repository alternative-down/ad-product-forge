/**
 * Unit tests for agents/time-constants.ts.
 * Static time constants used across agent runner modules.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { ONE_MINUTE_MS, TEN_MINUTES_MS, FIFTEEN_MINUTES_MS } from './time-constants';

describe('ONE_MINUTE_MS', () => {
  it('equals 60,000 milliseconds', () => {
    expect(ONE_MINUTE_MS).toBe(60_000);
  });
});

describe('TEN_MINUTES_MS', () => {
  it('equals 600,000 milliseconds', () => {
    expect(TEN_MINUTES_MS).toBe(600_000);
  });

  it('is 10 times ONE_MINUTE_MS', () => {
    expect(TEN_MINUTES_MS).toBe(10 * ONE_MINUTE_MS);
  });
});

describe('FIFTEEN_MINUTES_MS', () => {
  it('equals 900,000 milliseconds', () => {
    expect(FIFTEEN_MINUTES_MS).toBe(900_000);
  });

  it('is 15 times ONE_MINUTE_MS', () => {
    expect(FIFTEEN_MINUTES_MS).toBe(15 * ONE_MINUTE_MS);
  });

  it('is 1.5 times TEN_MINUTES_MS', () => {
    expect(FIFTEEN_MINUTES_MS).toBe(TEN_MINUTES_MS * 1.5);
  });
});

describe('consistency', () => {
  it('all constants are positive', () => {
    expect(ONE_MINUTE_MS).toBeGreaterThan(0);
    expect(TEN_MINUTES_MS).toBeGreaterThan(0);
    expect(FIFTEEN_MINUTES_MS).toBeGreaterThan(0);
  });

  it('ascending order: ONE < TEN < FIFTEEN', () => {
    expect(ONE_MINUTE_MS).toBeLessThan(TEN_MINUTES_MS);
    expect(TEN_MINUTES_MS).toBeLessThan(FIFTEEN_MINUTES_MS);
  });
});
