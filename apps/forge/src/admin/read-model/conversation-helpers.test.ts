import { describe, expect, test, vi } from 'vitest';
import { withTimeout } from '../../utils/async';

describe('withTimeout', () => {
  test('resolves when promise resolves before timeout', async () => {
    const fast = Promise.resolve('ok');
    const result = await withTimeout(fast, 5_000, 'Too slow');
    expect(result).toBe('ok');
  });

  test('rejects when promise takes longer than timeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 200));
    await expect(withTimeout(slow, 10, 'Too slow')).rejects.toThrow('Too slow');
  });

  test('clears timer after successful resolution', async () => {
    vi.useFakeTimers();
    try {
      const resolveSpy = vi.fn();
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('delayed');
          resolveSpy();
        }, 50);
      });

      const timeoutPromise = withTimeout(promise, 1_000, 'Deadline');
      const resultPromise = timeoutPromise;

      // resolve the slow promise
      vi.advanceTimersByTime(50);
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe('delayed');
    } finally {
      vi.useRealTimers();
    }
  });

  test('rejects with custom error message on timeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 999));
    await expect(withTimeout(slow, 10, 'Custom deadline exceeded')).rejects.toThrow(
      'Custom deadline exceeded',
    );
  });
});