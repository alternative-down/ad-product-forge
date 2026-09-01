import { describe, expect, it } from 'vitest';
import { WEEK_MS } from './constants';

describe('WEEK_MS', () => {
  it('is a positive number', () => {
    expect(WEEK_MS).toBeGreaterThan(0);
    expect(typeof WEEK_MS).toBe('number');
  });

  it('equals 7 * 24 * 60 * 60 * 1000 = 604800000', () => {
    expect(WEEK_MS).toBe(604800000);
  });

  it('can be divided evenly into days', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    expect(WEEK_MS / DAY_MS).toBe(7);
  });

  it('can be divided evenly into hours', () => {
    const HOUR_MS = 60 * 60 * 1000;
    expect(WEEK_MS / HOUR_MS).toBe(168);
  });
});
