/**
 * Unit tests for agents/time-constants.ts.
 * Static time constants used across agent runner modules.
 */
import { describe, expect, it } from 'vitest';
import {
  EIGHT_SECONDS_MS,
  FIVE_MINUTES_MS,
  FIVE_SECONDS_MS,
  FIFTEEN_MINUTES_MS,
  ONE_DAY_MS,
  ONE_HOUR_MS,
  ONE_MINUTE_MS,
  ONE_SECOND_MS,
  TEN_MINUTES_MS,
  TEN_SECONDS_MS,
  THIRTY_SECONDS_MS,
  TWO_MINUTES_MS,
  TWENTY_FIVE_SECONDS_MS,
} from './time-constants';

describe('ONE_SECOND_MS', () => {
  it('equals 1,000 milliseconds', () => {
    expect(ONE_SECOND_MS).toBe(1_000);
  });
});

describe('ONE_MINUTE_MS', () => {
  it('equals 60,000 milliseconds', () => {
    expect(ONE_MINUTE_MS).toBe(60_000);
  });

  it('is 60 times ONE_SECOND_MS', () => {
    expect(ONE_MINUTE_MS).toBe(60 * ONE_SECOND_MS);
  });
});

describe('derived seconds', () => {
  it('FIVE_SECONDS_MS = 5,000', () => {
    expect(FIVE_SECONDS_MS).toBe(5_000);
    expect(FIVE_SECONDS_MS).toBe(5 * ONE_SECOND_MS);
  });

  it('EIGHT_SECONDS_MS = 8,000', () => {
    expect(EIGHT_SECONDS_MS).toBe(8_000);
    expect(EIGHT_SECONDS_MS).toBe(8 * ONE_SECOND_MS);
  });

  it('TEN_SECONDS_MS = 10,000', () => {
    expect(TEN_SECONDS_MS).toBe(10_000);
    expect(TEN_SECONDS_MS).toBe(10 * ONE_SECOND_MS);
  });

  it('TWENTY_FIVE_SECONDS_MS = 25,000', () => {
    expect(TWENTY_FIVE_SECONDS_MS).toBe(25_000);
    expect(TWENTY_FIVE_SECONDS_MS).toBe(25 * ONE_SECOND_MS);
  });

  it('THIRTY_SECONDS_MS = 30,000', () => {
    expect(THIRTY_SECONDS_MS).toBe(30_000);
    expect(THIRTY_SECONDS_MS).toBe(30 * ONE_SECOND_MS);
  });
});

describe('derived minutes', () => {
  it('TWO_MINUTES_MS = 120,000', () => {
    expect(TWO_MINUTES_MS).toBe(120_000);
    expect(TWO_MINUTES_MS).toBe(2 * ONE_MINUTE_MS);
  });

  it('TEN_MINUTES_MS = 600,000', () => {
    expect(TEN_MINUTES_MS).toBe(600_000);
    expect(TEN_MINUTES_MS).toBe(10 * ONE_MINUTE_MS);
  });

  it('FIFTEEN_MINUTES_MS = 900,000', () => {
    expect(FIFTEEN_MINUTES_MS).toBe(900_000);
    expect(FIFTEEN_MINUTES_MS).toBe(15 * ONE_MINUTE_MS);
    expect(FIFTEEN_MINUTES_MS).toBe(TEN_MINUTES_MS * 1.5);
  });

  it('FIVE_MINUTES_MS = 300,000', () => {
    expect(FIVE_MINUTES_MS).toBe(300_000);
    expect(FIVE_MINUTES_MS).toBe(5 * ONE_MINUTE_MS);
  });
});

describe('long-horizon TTLs', () => {
  it('ONE_HOUR_MS = 3,600,000', () => {
    expect(ONE_HOUR_MS).toBe(3_600_000);
    expect(ONE_HOUR_MS).toBe(60 * ONE_MINUTE_MS);
  });

  it('ONE_DAY_MS = 86,400,000', () => {
    expect(ONE_DAY_MS).toBe(86_400_000);
    expect(ONE_DAY_MS).toBe(24 * ONE_HOUR_MS);
    expect(ONE_DAY_MS).toBe(24 * 60 * ONE_MINUTE_MS);
  });
});

describe('consistency', () => {
  it('all constants are positive', () => {
    const all = [
      ONE_SECOND_MS,
      ONE_MINUTE_MS,
      FIVE_SECONDS_MS,
      EIGHT_SECONDS_MS,
      TEN_SECONDS_MS,
      TWENTY_FIVE_SECONDS_MS,
      THIRTY_SECONDS_MS,
      TWO_MINUTES_MS,
      FIVE_MINUTES_MS,
      TEN_MINUTES_MS,
      FIFTEEN_MINUTES_MS,
      ONE_HOUR_MS,
      ONE_DAY_MS,
    ];
    for (const v of all) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('strict ascending order across all', () => {
    const ordered = [
      ONE_SECOND_MS,
      FIVE_SECONDS_MS,
      EIGHT_SECONDS_MS,
      TEN_SECONDS_MS,
      TWENTY_FIVE_SECONDS_MS,
      THIRTY_SECONDS_MS,
      ONE_MINUTE_MS,
      TWO_MINUTES_MS,
      FIVE_MINUTES_MS,
      TEN_MINUTES_MS,
      FIFTEEN_MINUTES_MS,
      ONE_HOUR_MS,
      ONE_DAY_MS,
    ];
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i - 1]).toBeLessThan(ordered[i]);
    }
  });
});
