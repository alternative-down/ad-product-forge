/**
 * schedules/cron.ts
 *
 * Cron expression parsing and validation.
 * Extracted from manager.ts (#4877) — cron parsing concern only.
 */
import { parseExpression } from 'cron-parser';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/agent-runner-error-formatting';

export const HEARTBEAT_CRON_EXPRESSION = '0 * * * *';
export const HEARTBEAT_TIMEZONE = 'UTC';
export const HEARTBEAT_NAME = 'System heartbeat';

export function validateCronExpression(expression: string): boolean {
  try {
    parseExpression(expression, { utc: true });
    return true;
  } catch (error) {
    forgeDebug({
      scope: 'schedules-cron',
      level: 'error',
      message: 'Cron expression validation failed',
      context: { error: errorMsg(error) },
    });
    return false;
  }
}

export function parseCronExpression(expression: string) {
  return parseExpression(expression, { utc: true });
}