/**
 * schedules/cron.ts
 *
 * Heartbeat cron constants for the system heartbeat schedule.
 */

export const HEARTBEAT_CRON_EXPRESSION = '0 * * * *';
export const HEARTBEAT_TIMEZONE = 'UTC';
export const HEARTBEAT_NAME = 'System heartbeat';

/**
 * Stale threshold: heartbeat older than this is considered stale (not actively
 * reporting in normal cadence). Default 5 minutes — heartbeat cron runs hourly
 * (every 60min), so 5min allows for natural drift without false positives.
 */
export const HEARTBEAT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Dead threshold: heartbeat older than this is considered dead (agent likely
 * crashed or stuck). Default 30 minutes — half of the heartbeat interval.
 */
export const HEARTBEAT_DEAD_THRESHOLD_MS = 30 * 60 * 1000;
