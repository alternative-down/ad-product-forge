/**
 * Shared async utilities — single source of truth for cross-module helpers.
 */

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
 * Sleep for a given number of milliseconds.
 */
export function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
