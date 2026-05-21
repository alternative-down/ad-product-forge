import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAverageStepIntervalMs } from './agent-home-metrics-thread-helpers';
import {
  formatStepIntervalLabel,
  computeIntervalConsistencyScore,
} from './agent-home-metrics-interval-helpers';

describe('formatStepIntervalLabel', () => {
  it('returns null for null input', () => {
    expect(formatStepIntervalLabel(null)).toBeNull();
  });

  it('returns null for negative input', () => {
    expect(formatStepIntervalLabel(-1)).toBeNull();
  });

  it('formats seconds only', () => {
    expect(formatStepIntervalLabel(0)).toBe('0s');
    expect(formatStepIntervalLabel(5000)).toBe('5s');
    expect(formatStepIntervalLabel(59000)).toBe('59s');
  });

  it('formats minutes with seconds', () => {
    expect(formatStepIntervalLabel(60000)).toBe('1m');
    expect(formatStepIntervalLabel(65000)).toBe('1m 5s');
    expect(formatStepIntervalLabel(121000)).toBe('2m 1s');
  });

  it('formats minutes only when no remainder', () => {
    expect(formatStepIntervalLabel(120000)).toBe('2m');
    expect(formatStepIntervalLabel(3600000)).toBe('60m');
  });
});

describe('computeIntervalConsistencyScore', () => {
  it('returns null for fewer than 2 steps', () => {
    expect(computeIntervalConsistencyScore([])).toBeNull();
    expect(computeIntervalConsistencyScore([{ createdAt: 1000 }])).toBeNull();
  });

  it('returns 100 for steps with identical timestamps', () => {
    const steps = [{ createdAt: 100 }, { createdAt: 100 }, { createdAt: 100 }];
    expect(computeIntervalConsistencyScore(steps)).toBe(100);
  });

  it('returns high score for consistent intervals', () => {
    const steps = [
      { createdAt: 6000 },
      { createdAt: 5000 },
      { createdAt: 4000 },
      { createdAt: 3000 },
      { createdAt: 2000 },
      { createdAt: 1000 },
    ];
    const score = computeIntervalConsistencyScore(steps);
    expect(score).not.toBeNull();
    expect(score).toBeGreaterThan(90);
  });

  it('returns low score for erratic intervals', () => {
    const steps = [
      { createdAt: 10000 },
      { createdAt: 9500 },
      { createdAt: 8500 },
      { createdAt: 2000 },
      { createdAt: 1500 },
      { createdAt: 1000 },
    ];
    const score = computeIntervalConsistencyScore(steps);
    expect(score).not.toBeNull();
    expect(score).toBeLessThan(80);
  });
});

describe('buildAverageStepIntervalMs (re-exported)', () => {
  it('returns null for empty array', () => {
    expect(buildAverageStepIntervalMs([])).toBeNull();
  });

  it('returns null for single step', () => {
    expect(buildAverageStepIntervalMs([{ createdAt: 1700000000000 }])).toBeNull();
  });

  it('computes average from 2 steps', () => {
    expect(buildAverageStepIntervalMs([{ createdAt: 200 }, { createdAt: 100 }])).toBe(100);
  });

  it('handles unsorted input', () => {
    expect(
      buildAverageStepIntervalMs([{ createdAt: 1000 }, { createdAt: 500 }, { createdAt: 800 }]),
    ).toBe(250);
  });
});
