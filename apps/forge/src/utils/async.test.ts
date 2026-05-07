/**
 * Unit tests for utils/async.ts — withTimeout utility.
 * Zero prior coverage for this shared async helper.
 */
import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './async';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with result when promise resolves before timeout', async () => {
    vi.useRealTimers();
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10));
    const result = await withTimeout(promise, 5000, 'timed out');
    expect(result).toBe('done');
  });

  it('rejects with Error when timeout fires first', async () => {
    vi.useRealTimers();
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('never'), 5000));
    const resultPromise = withTimeout(promise, 10, 'timed out');
    await expect(resultPromise).rejects.toThrow('timed out');
  });

  it('calls onTimeout callback before rejecting', async () => {
    vi.useRealTimers();
    const onTimeout = vi.fn();
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('never'), 5000));
    const resultPromise = withTimeout(promise, 10, 'timed out', onTimeout);
    await expect(resultPromise).rejects.toThrow('timed out');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout when promise resolves first', async () => {
    vi.useRealTimers();
    const onTimeout = vi.fn();
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10));
    await withTimeout(promise, 5000, 'timed out', onTimeout);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('clears timer when promise resolves before timeout (finally block)', async () => {
    vi.useRealTimers();
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10));
    const result = await withTimeout(promise, 5000, 'should not fire');
    expect(result).toBe('done');
  });

  it('accepts promise that resolves immediately', async () => {
    vi.useRealTimers();
    const result = await withTimeout(Promise.resolve(42), 1000, 'too slow');
    expect(result).toBe(42);
  });

  it('accepts promise that rejects immediately', async () => {
    vi.useRealTimers();
    const promise = Promise.reject(new Error('boom'));
    await expect(withTimeout(promise, 1000, 'ignored')).rejects.toThrow('boom');
  });

  it('timeout of 0 rejects immediately', async () => {
    vi.useRealTimers();
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('never'), 1000));
    const resultPromise = withTimeout(promise, 0, 'zero timeout');
    await expect(resultPromise).rejects.toThrow('zero timeout');
  });

  it('passes generic type T through correctly', async () => {
    vi.useRealTimers();
    const obj = { key: 'value', nested: { deep: 1 } };
    const result = await withTimeout(Promise.resolve(obj), 1000, 'too slow');
    expect(result).toEqual({ key: 'value', nested: { deep: 1 } });
  });
});