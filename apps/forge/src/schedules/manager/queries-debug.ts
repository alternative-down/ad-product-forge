import { forgeDebug } from '@forge-runtime/core';
import { LogLevel } from '../../types/log-level';

/**
 * Module-local debug helper for the schedules/manager/ scope.
 * Bakes in scope=schedules-manager so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction, broadened in
 *   D46 cycle 9 to support all forgeDebug levels used in
 *   schedules/manager/{queries,mutations,lifecycle-ops}.ts).
 *   - 3 forgeDebug call-sites in queries.ts use scope=schedules-manager, level=error
 *   - 3 forgeDebug call-sites in mutations.ts use scope=schedules-manager, level=error
 *   - 2 forgeDebug call-sites in lifecycle-ops.ts use scope=schedules-manager,
 *     mix of level=info (1) and level=error (1)
 *
 * Usage (after D46 cycle 9 broadening — supports debug/info/warn/error):
 *   queriesSchedulesManagerDebug('error', 'getAgentSchedule failed', { agentId, scheduleId, error });
 *   queriesSchedulesManagerDebug('info', '__registerSchedule: lifecycle is null (stopped)', { scheduleId });
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 */
export const queriesSchedulesManagerDebug = (
  level: LogLevel,
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
