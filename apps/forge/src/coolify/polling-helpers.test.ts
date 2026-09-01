/**
 * Unit tests for coolify/polling-helpers.ts.
 * Zero prior coverage for pollUntil + retryWithBackoff helpers
 * introduced by #6541 (P0 #6337 follow-up).
 */
import { describe, expect, it, vi } from 'vitest';
import { pollUntil, retryWithBackoff } from './polling-helpers';

// ─── pollUntil ───────────────────────────────────────────────────────────────

describe('pollUntil', () => {
  it('returns first truthy result', async () => {
    const fn = vi.fn(async () => 'result');
    const result = await pollUntil(fn, { maxAttempts: 3, intervalMs: 1 });
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('polls until truthy result appears', async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 3) return null;
      return 'third-attempt';
    });
    const result = await pollUntil(fn, { maxAttempts: 5, intervalMs: 1 });
    expect(result).toBe('third-attempt');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('returns false-as-truthy when explicitly typed', async () => {
    // false is treated as truthy-failure (continue polling)
    const fn = vi.fn(async () => false);
    await expect(
      pollUntil(fn, { maxAttempts: 2, intervalMs: 1 }),
    ).rejects.toThrow('max attempts reached');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws when maxAttempts exhausted', async () => {
    const fn = vi.fn(async () => null);
    await expect(
      pollUntil(fn, { maxAttempts: 3, intervalMs: 1 }),
    ).rejects.toThrow(/pollUntil: max attempts reached \(3 attempts/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws when maxAttempts <= 0', async () => {
    const fn = vi.fn(async () => 'x');
    await expect(
      pollUntil(fn, { maxAttempts: 0, intervalMs: 1 }),
    ).rejects.toThrow('maxAttempts must be > 0');
  });

  it('throws when intervalMs < 0', async () => {
    const fn = vi.fn(async () => 'x');
    await expect(
      pollUntil(fn, { maxAttempts: 1, intervalMs: -1 }),
    ).rejects.toThrow('intervalMs must be >= 0');
  });

  it('applies exponential backoff multiplier', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn(async () => null);
      const promise = pollUntil(fn, {
        maxAttempts: 3,
        intervalMs: 100,
        backoffMultiplier: 2,
      });
      // Attach catch to prevent unhandled rejection during fake timers
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);
      await expect(promise).rejects.toThrow('max attempts reached');
    } finally {
      vi.useRealTimers();
    }
  });

  it('invokes onAttempt callback with attempt and elapsedMs', async () => {
    const onAttempt = vi.fn();
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      return attempt === 2 ? 'ok' : null;
    });
    await pollUntil(fn, {
      maxAttempts: 5,
      intervalMs: 1,
      onAttempt,
    });
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenNthCalledWith(1, 1, expect.any(Number));
    expect(onAttempt).toHaveBeenNthCalledWith(2, 2, expect.any(Number));
  });

  it('aborts early when abortSignal is set', async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort();
      return null;
    });
    await expect(
      pollUntil(fn, {
        maxAttempts: 5,
        intervalMs: 1,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow('aborted');
  });
});

// ─── retryWithBackoff ────────────────────────────────────────────────────────

describe('retryWithBackoff', () => {
  it('returns first successful result', async () => {
    const fn = vi.fn(async () => 'success');
    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      initialMs: 1,
    });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on error and returns successful result', async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 2) throw new Error('transient');
      return 'ok';
    });
    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      initialMs: 1,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws last error when all retries fail', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('third'));
    await expect(
      retryWithBackoff(fn, { maxRetries: 2, initialMs: 1 }),
    ).rejects.toThrow('third');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws when maxRetries < 0', async () => {
    const fn = vi.fn(async () => 'x');
    await expect(
      retryWithBackoff(fn, { maxRetries: -1, initialMs: 1 }),
    ).rejects.toThrow('maxRetries must be >= 0');
  });

  it('throws when initialMs < 0', async () => {
    const fn = vi.fn(async () => 'x');
    await expect(
      retryWithBackoff(fn, { maxRetries: 0, initialMs: -1 }),
    ).rejects.toThrow('initialMs must be >= 0');
  });

  it('aborts early when abortSignal is set', async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort();
      throw new Error('transient');
    });
    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        initialMs: 1,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow('aborted');
  });

  it('applies exponential backoff multiplier', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(new Error('second'))
        .mockResolvedValueOnce('ok');
      const promise = retryWithBackoff(fn, {
        maxRetries: 3,
        initialMs: 100,
        multiplier: 2,
      });
      // Attach catch to prevent unhandled rejection during fake timers
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await expect(promise).resolves.toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles non-Error throws', async () => {
    const fn = vi.fn().mockRejectedValueOnce('string-error');
    await expect(
      retryWithBackoff(fn, { maxRetries: 0, initialMs: 1 }),
    ).rejects.toThrow('retryWithBackoff: string-error');
  });
});
