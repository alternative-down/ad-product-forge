import { forgeDebug } from '@forge-runtime/core';
import { LogLevel } from '../../types/log-level';

/**
 * LHS (LOCAL HELPER SHADOWING) SEPARATE-FILE helper for apps/forge/src/schedules/notifications/wake-content.ts
 *
 * Per:
 *   - L#NN-YYY v4 SEPARATE-FILE extraction pattern
 *   - L#NN-50 #50 LOG RETENTION (SPREAD context fields to TOP-LEVEL)
 *   - LHS PERMANENT N=5 (cycle 13 D46 Q1-I Aldric) — PROMOTION to PERMANENT GOLD
 *
 * Replaces local const `scheduleHelpersDebug` that wrapped forgeDebug with NESTED context.
 * Shared helper enables consistent log structure across all schedule-helpers calls.
 */
export const scheduleHelpersDebug = (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({ scope: 'schedule-helpers', level, message, ...context });
};
