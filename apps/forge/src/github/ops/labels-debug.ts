import { forgeDebug } from '@forge-runtime/core';
import { LogLevel } from '../../types/log-level';

/**
 * Module-local debug helper for github/ops/labels.ts.
 * Bakes in scope=github-ops-labels so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 6 forgeDebug call-sites in labels.ts all use scope=github-ops-labels
 *   - This helper collapses the scope repetition while preserving level + message + context
 *
 * Usage:
 *   labelsDebug('error', 'createLabel failed', { agentId, error: errorMsg(err) });
 */
export function labelsDebug(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'github-ops-labels',
    level,
    message,
    context,
  });
}
