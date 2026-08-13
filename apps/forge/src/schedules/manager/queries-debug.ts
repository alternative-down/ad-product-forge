import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for schedules/manager/queries.ts.
 * Bakes in scope=schedules-manager so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 3 forgeDebug call-sites in queries.ts all use scope=schedules-manager
 *     and level=error
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   queriesSchedulesManagerDebug('error', 'getAgentSchedule failed', { agentId, scheduleId, error });
 */
export const queriesSchedulesManagerDebug = (
  level: 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'schedules-manager',
    level,
    message,
    ...context,
  });
};
