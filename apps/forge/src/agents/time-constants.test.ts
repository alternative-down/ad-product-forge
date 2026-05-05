import { describe, expect, it } from 'vitest';
import {
  ONE_MINUTE_MS,
  TEN_MINUTES_MS,
  FIFTEEN_MINUTES_MS,
} from './time-constants';

describe('ONE_MINUTE_MS', () => {
  it('is 60000', () => {
    expect(ONE_MINUTE_MS).toBe(60_000);
  });

  it('is a number', () => {
    expect(typeof ONE_MINUTE_MS).toBe('number');
  });
});

describe('TEN_MINUTES_MS', () => {
  it('is 600000', () => {
    expect(TEN_MINUTES_MS).toBe(600_000);
  });

  it('equals 10 * ONE_MINUTE_MS', () => {
    expect(TEN_MINUTES_MS).toBe(10 * ONE_MINUTE_MS);
  });
});

describe('FIFTEEN_MINUTES_MS', () => {
  it('is 900000', () => {
    expect(FIFTEEN_MINUTES_MS).toBe(900_000);
  });

  it('equals 15 * ONE_MINUTE_MS', () => {
    expect(FIFTEEN_MINUTES_MS).toBe(15 * ONE_MINUTE_MS);
  });

  it('is greater than TEN_MINUTES_MS', () => {
    expect(FIFTEEN_MINUTES_MS).toBeGreaterThan(TEN_MINUTES_MS);
  });
});

describe('relationships', () => {
  it('all constants are positive', () => {
    expect(ONE_MINUTE_MS).toBeGreaterThan(0);
    expect(TEN_MINUTES_MS).toBeGreaterThan(0);
    expect(FIFTEEN_MINUTES_MS).toBeGreaterThan(0);
  });

  it('ONE_MINUTE_MS is the smallest', () => {
    expect(ONE_MINUTE_MS).toBeLessThan(TEN_MINUTES_MS);
    expect(ONE_MINUTE_MS).toBeLessThan(FIFTEEN_MINUTES_MS);
  });
});