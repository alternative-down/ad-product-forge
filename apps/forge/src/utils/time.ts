export interface TimeProvider {
  now(): number;
}

/**
 * Creates a TimeProvider.
 *
 * In production, pass Date.now (or let it default to Date.now).
 * In tests, pass a controlled function so time can be mocked.
 */
export function createTimeProvider(now: () => number = Date.now): TimeProvider {
  return { now };
}