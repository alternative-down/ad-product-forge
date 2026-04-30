import { describe, expect, it } from 'vitest';
import { WEEK_MS } from './constants';

describe('WEEK_MS', () => {
  it('equals 7 days in milliseconds', () => {
    expect(WEEK_MS).toBe(604800000);
  });

  it('is a positive integer', () => {
    expect(WEEK_MS).toBeGreaterThan(0);
    expect(Number.isInteger(WEEK_MS)).toBe(true);
  });

  it('equals 1000 * 60 * 60 * 24 * 7', () => {
    expect(WEEK_MS).toBe(1000 * 60 * 60 * 24 * 7);
  });
});
