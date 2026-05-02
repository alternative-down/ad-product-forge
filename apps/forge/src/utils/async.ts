/**
 * Shared async utilities — single source of truth for cross-module helpers.
 */

/**
 * Race a promise against a timeout. Rejects with Error(message) on timeout.
 * The timer is always cleared in finally to avoid memory leaks.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
