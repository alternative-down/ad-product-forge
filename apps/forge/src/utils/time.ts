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

// ─── Module-level test override ────────────────────────────────────────────

let _currentTimeMs: () => number = Date.now;

/**
 * Returns the current time in milliseconds.
 * Replaces `Date.now()` calls for testability.
 *
 * In production, returns `Date.now()`.
 * In tests, call `setCurrentTimeMs(fn)` to override with a fixed value.
 */
export function currentTimeMs(): number {
  return _currentTimeMs();
}

/**
 * Override the time source used by `currentTimeMs()`.
 * Intended for tests only — reset after each test.
 */
function setCurrentTimeMs(fn: () => number): void {
  _currentTimeMs = fn;
}

/**
 * Reset to the real system clock.
 * Call in `afterEach` or `after` hooks in tests.
 */
function resetCurrentTimeMs(): void {
  _currentTimeMs = Date.now;
}