/**
 * agent-runner-scheduler-healthcheck.ts
 *
 * Manages healthcheck timer lifecycle for the agent scheduler.
 * Extracted from agent-runner-scheduler.ts (#2257).
 *
 * Public interface:
 * - startHealthcheck: starts the periodic runner recovery callback
 * - clearHealthcheck: clears the healthcheck timer interval
 * - shouldRunHealthcheckAt(now): returns true if a healthcheck should run now
 * - getHealthcheckIntervalMs(): returns the configured interval in ms
 * - getHealthcheckTimer(): returns the raw timer reference
 */
import { THIRTY_SECONDS_MS } from './time-constants';

export type SchedulerHealthcheck = {
  startHealthcheck(): void;
  clearHealthcheck(): void;
  shouldRunHealthcheckAt(now: number): boolean;
  getHealthcheckIntervalMs(): number;
  getHealthcheckTimer(): ReturnType<typeof setInterval> | null;
};

export interface SchedulerHealthcheckDeps {
  runtimeId: string;
  onHealthcheck(): Promise<void>;
}

const RUNNER_HEALTHCHECK_INTERVAL_MS = THIRTY_SECONDS_MS;

export function createSchedulerHealthcheck(_deps: SchedulerHealthcheckDeps): SchedulerHealthcheck {
  let healthcheckTimer: ReturnType<typeof setInterval> | null = null;
  let healthcheckNextAt: number | null = null;
  let healthcheckRunning = false;

  /**
   * Starts one interval per scheduler and prevents overlapping probes.
   */
  function startHealthcheck(): void {
    if (healthcheckTimer !== null) {
      return;
    }

    healthcheckNextAt = Date.now() + RUNNER_HEALTHCHECK_INTERVAL_MS;
    healthcheckTimer = setInterval(() => {
      healthcheckNextAt = Date.now() + RUNNER_HEALTHCHECK_INTERVAL_MS;
      if (healthcheckRunning) {
        return;
      }

      healthcheckRunning = true;
      void _deps.onHealthcheck().finally(() => {
        healthcheckRunning = false;
      });
    }, RUNNER_HEALTHCHECK_INTERVAL_MS);
  }

  function clearHealthcheck(): void {
    if (!healthcheckTimer) {
      return;
    }
    clearInterval(healthcheckTimer);
    healthcheckTimer = null;
    healthcheckNextAt = null;
  }

  /**
   * External healthcheck interface.
   * shouldRunHealthcheckAt: returns true if a healthcheck should run now.
   * getHealthcheckIntervalMs: returns the interval in ms.
   */
  function shouldRunHealthcheckAt(now: number): boolean {
    if (healthcheckNextAt === null || healthcheckNextAt === undefined) return false;
    return now >= healthcheckNextAt;
  }

  function getHealthcheckIntervalMs(): number {
    return RUNNER_HEALTHCHECK_INTERVAL_MS;
  }

  function getHealthcheckTimer(): ReturnType<typeof setInterval> | null {
    return healthcheckTimer;
  }

  return {
    startHealthcheck,
    clearHealthcheck,
    shouldRunHealthcheckAt,
    getHealthcheckIntervalMs,
    getHealthcheckTimer,
  };
}
