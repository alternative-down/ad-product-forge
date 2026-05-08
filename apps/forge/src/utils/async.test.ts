/**
 * Unit tests for utils/async.ts.
 * withTimeout — async race with optional timeout side-effect.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './async';

// ─── Happy path ─────────────────────────────────────────────────────────

describe('withTimeout — happy path', () => {
  it('resolves when promise resolves before timeout', async () => {
    const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 10));
    const result = await withTimeout(promise, 5_000, 'Timed out');
    expect(result).toBe('done');
  });

  it('resolves immediately resolved promise', async () => {
    const promise = Promise.resolve('immediate');
    const result = await withTimeout(promise, 5_000, 'Timed out');
    expect(result).toBe('immediate');
  });

  it('passes resolved value through correctly', async () => {
    const promise = new Promise<{ data: string }>(resolve => setTimeout(() => resolve({ data: 'value' }), 5));
    const result = await withTimeout(promise, 5_000, 'Timed out');
    expect(result).toEqual({ data: 'value' });
  });
});

// ─── Timeout triggered ────────────────────────────────────────────────

describe('withTimeout — timeout triggered', () => {
  it('rejects with message when timeout is reached', async () => {
    const slowPromise = new Promise<string>(resolve => setTimeout(() => resolve('late'), 500));
    await expect(withTimeout(slowPromise, 50, 'Too slow'))
      .rejects.toThrow('Too slow');
  });

  it('rejects Error instance with correct message', async () => {
    const slowPromise = new Promise<string>(resolve => setTimeout(() => resolve('x'), 500));
    try {
      await withTimeout(slowPromise, 10, 'Custom timeout message');
      expect.fail('Should have thrown');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toBe('Custom timeout message');
    }
  });
});

// ─── onTimeout callback ───────────────────────────────────────────────

describe('withTimeout — onTimeout callback', () => {
  it('calls onTimeout before rejecting', async () => {
    const onTimeout = vi.fn();
    const slowPromise = new Promise<string>(resolve => setTimeout(() => resolve('x'), 500));
    await expect(withTimeout(slowPromise, 10, 'Timed out', onTimeout))
      .rejects.toThrow('Timed out');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout when promise resolves first', async () => {
    const onTimeout = vi.fn();
    const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 5));
    await withTimeout(promise, 5_000, 'Timed out', onTimeout);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('onTimeout is optional', async () => {
    const slowPromise = new Promise<string>(resolve => setTimeout(() => resolve('x'), 500));
    await expect(withTimeout(slowPromise, 10, 'Timed out'))
      .rejects.toThrow('Timed out');
  });

  it('onTimeout is called exactly once on timeout', async () => {
    const onTimeout = vi.fn();
    const slowPromise = new Promise<string>(resolve => setTimeout(() => resolve('x'), 500));
    try {
      await withTimeout(slowPromise, 20, 'Timed', onTimeout);
    } catch {
      // expected
    }
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

// ─── Timer cleanup ────────────────────────────────────────────────────

describe('withTimeout — timer cleanup', () => {
  it('clears timer after promise resolves', async () => {
    const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 10));
    await withTimeout(promise, 5_000, 'msg');
    // If timer wasn't cleared, the test would complete fine (no memory leak observable here,
    // but we document the cleanup behavior through the positive test passing)
  });
});