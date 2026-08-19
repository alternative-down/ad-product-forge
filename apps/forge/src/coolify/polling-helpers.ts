/**
 * Polling and retry helpers for Coolify deploy verification.
 * Issue #6541 — Poll until phase + retry with exponential backoff.
 *
 * Pattern from #6337 (P0 follow-up) — replace single-shot verification phases
 * with polling + retry to handle Coolify-side settling delays (30-60s typical).
 *
 * Pattern L parallel: typed helpers like `coolify/errors.ts` debug/error
 * helpers. Pure functions, no external deps beyond timing primitives.
 */

import { forgeDebug } from '@forge-runtime/core';
import {
  PollUntilInvalidMaxAttemptsError,
  PollUntilInvalidIntervalError,
  PollUntilAbortedError,
  PollUntilMaxAttemptsReachedError,
  RetryWithBackoffInvalidMaxRetriesError,
  RetryWithBackoffInvalidInitialMsError,
  RetryWithBackoffAbortedError,
} from './polling-helpers.errors';

const POLLING_HELPERS_SCOPE = 'coolify-polling-helpers' as const;

function pollUntilLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({ scope: POLLING_HELPERS_SCOPE, level, message, context });
}

export interface PollUntilOptions {
  /** Maximum number of attempts before giving up. */
  maxAttempts: number;
  /** Initial interval between attempts (ms). */
  intervalMs: number;
  /** Backoff multiplier applied after each attempt. Default 1.5. */
  backoffMultiplier?: number;
  /** Optional abort signal to cancel polling early. */
  abortSignal?: AbortSignal;
  /** Optional callback invoked after each attempt (1-indexed). */
  onAttempt?: (attempt: number, elapsedMs: number) => void;
}

/**
 * Poll `fn` until it returns a truthy value or `maxAttempts` is reached.
 * Returns the first truthy result. Throws if maxAttempts exhausted.
 *
 * Uses exponential backoff: `intervalMs * (backoffMultiplier ** (attempt-1))`.
 * Use `abortSignal` to cancel early (e.g., on shutdown).
 */
export async function pollUntil<T>(
  fn: () => Promise<T | null | undefined | false>,
  options: PollUntilOptions,
): Promise<T> {
  const {
    maxAttempts,
    intervalMs,
    backoffMultiplier = 1.5,
    abortSignal,
    onAttempt,
  } = options;

  if (maxAttempts <= 0) {
    throw new PollUntilInvalidMaxAttemptsError(maxAttempts);
  }
  if (intervalMs < 0) {
    throw new PollUntilInvalidIntervalError(intervalMs);
  }

  const startTime = Date.now();
  let interval = intervalMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (abortSignal?.aborted === true) {
      pollUntilLog('warn', 'pollUntil: aborted', { attempt });
      throw new PollUntilAbortedError();
    }

    const result = await fn();
    onAttempt?.(attempt, Date.now() - startTime);

    if (result) {
      return result as T;
    }

    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, interval);
      });
      interval *= backoffMultiplier;
    }
  }

  const elapsedMs = Date.now() - startTime;
  pollUntilLog('warn', 'pollUntil: max attempts reached', {
    maxAttempts,
    elapsedMs,
  });
  throw new PollUntilMaxAttemptsReachedError(maxAttempts, elapsedMs);
}

export interface RetryWithBackoffOptions {
  /** Maximum number of retries (count of attempts = maxRetries + 1). */
  maxRetries: number;
  /** Initial delay before first retry (ms). */
  initialMs: number;
  /** Backoff multiplier applied after each retry. Default 2. */
  multiplier?: number;
  /** Optional abort signal to cancel retries early. */
  abortSignal?: AbortSignal;
}

/**
 * Retry `fn` with exponential backoff on rejection.
 * Returns the first successful result. Throws last error if all retries fail.
 *
 * Uses exponential backoff: `initialMs * (multiplier ** retryIndex)`.
 * Use `abortSignal` to cancel early.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryWithBackoffOptions,
): Promise<T> {
  const { maxRetries, initialMs, multiplier = 2, abortSignal } = options;

  if (maxRetries < 0) {
    throw new RetryWithBackoffInvalidMaxRetriesError(maxRetries);
  }
  if (initialMs < 0) {
    throw new RetryWithBackoffInvalidInitialMsError(initialMs);
  }

  let delay = initialMs;
  let lastError: unknown = new Error('retryWithBackoff: no attempts made');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted === true) {
      pollUntilLog('warn', 'retryWithBackoff: aborted', { attempt });
      throw new RetryWithBackoffAbortedError();
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
        delay *= multiplier;
      }
    }
  }

  pollUntilLog('warn', 'retryWithBackoff: all retries failed', {
    maxRetries,
    finalDelay: delay,
  });
  throw lastError instanceof Error
    ? lastError
    : new Error(`retryWithBackoff: ${String(lastError)}`);
}
