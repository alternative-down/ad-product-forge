import { forgeDebug } from '@forge-runtime/core';
import { LogLevel } from '../../types/log-level';

/**
 * LHS (LOCAL HELPER SHADOWING) SEPARATE-FILE helper for apps/forge/src/schedules/tools/tools.ts
 *
 * Per:
 *   - L#NN-YYY v4 SEPARATE-FILE extraction pattern
 *   - L#NN-50 #50 LOG RETENTION (SPREAD context fields to TOP-LEVEL)
 *   - LHS PERMANENT N=5 (cycle 13 D46 Q1-I Aldric) — PROMOTION to PERMANENT GOLD
 *
 * Replaces local function `toolsScheduleDebug` that wrapped forgeDebug with NESTED context.
 * Shared helper enables consistent log structure across all tools:schedules calls.
 */
export const toolsScheduleDebug = (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({ scope: 'tools:schedules', level, message, ...context });
};
