/**
 * Shared async utilities — single source of truth for cross-module helpers.
 */

import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';

/**
 * Race a promise against a timeout. Rejects with Error(message) on timeout.
 * The timer is always cleared in finally to avoid memory leaks.
 * Optionally calls onTimeout() before rejecting (useful for side-effects like cleanup).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null && timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Combines withTimeout with structured error logging. Intended for observability
 * endpoints where a slow or failing read should degrade gracefully (return the
 * fallback) but the underlying error must still be logged so operators can
 * diagnose blank charts / stuck runs (closes #6022 admin chart blank; reused
 * by #6245 scheduler refactor).
 */
export async function withTimeoutAndLog<T>(params: {
  scope: string;
  op: string;
  promise: Promise<T>;
  timeoutMs: number;
  timeoutMessage: string;
  fallback: T;
}): Promise<T> {
  return await withTimeout(params.promise, params.timeoutMs, params.timeoutMessage).catch(
    (err) => {
      const msg = errorMsg(err).slice(0, 100);
      forgeDebug({
        scope: params.scope,
        level: 'warn',
        message: params.op + ' failed: ' + msg,
        context: { error: errorMsg(err) },
      });
      return params.fallback;
    },
  );
}

/**
 * Sleep for a given number of milliseconds.
 */
export function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}