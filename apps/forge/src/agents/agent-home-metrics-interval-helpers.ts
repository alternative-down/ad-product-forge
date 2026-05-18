/**
 * Pure interval computation helpers for agent home metrics.
 * No I/O, no side effects — all functions are deterministic.
 */

// Re-export for convenience (single source of truth)

/**
 * Formats a step interval in milliseconds to a human-readable label.
 * Returns null for invalid inputs.
 *
 * Examples:
 *   formatStepIntervalLabel(5000)  → "5s"
 *   formatStepIntervalLabel(65000) → "1m 5s"
 *   formatStepIntervalLabel(null)  → null
 *   formatStepIntervalLabel(-1)    → null
 */
export function formatStepIntervalLabel(intervalMs: number | null): string | null {
  if (intervalMs === null || intervalMs < 0) {
    return null;
  }

  const seconds = Math.floor(intervalMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Computes a "health score" based on step interval consistency.
 * Returns a value 0-100 where higher = more consistent pacing.
 *
 * Uses coefficient of variation: lower CV = more consistent = higher score.
 * CV = stddev / mean. We invert: score = max(0, 100 - cv * 100).
 */
export function computeIntervalConsistencyScore(
  recentSteps: Array<{ createdAt: number }>,
): number | null {
  const DELTA_COUNT = 6;
  if (recentSteps.length < 2) {
    return null;
  }

  const deltas: number[] = [];
  const sorted = [...recentSteps]
    .sort((a, b) => b.createdAt - a.createdAt) // newest first
    .slice(0, DELTA_COUNT);

  for (let i = 0; i < sorted.length - 1; i++) {
    deltas.push(Math.max(sorted[i].createdAt - sorted[i + 1].createdAt, 0));
  }

  if (deltas.length === 0) return null;

  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (mean === 0) return 100; // all same timestamp

  const variance = deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;

  return Math.max(0, Math.round(100 - cv * 100));
}
