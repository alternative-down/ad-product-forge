/**
 * agent-runner-scheduler-healthcheck.ts
 *
 * Manages healthcheck timer lifecycle for the agent scheduler.
 * Extracted from agent-runner-scheduler.ts (#2257).
 *
 * Public interface:
 * - startHealthcheck: no-op (external timer management)
 * - clearHealthcheck: clears the healthcheck timer interval
 * - shouldRunHealthcheckAt(now): returns true if a healthcheck should run now
 * - getHealthcheckIntervalMs(): returns the configured interval in ms
 */

export type SchedulerHealthcheck = {
  startHealthcheck(): void;
  clearHealthcheck(): void;
  shouldRunHealthcheckAt(now: number): boolean;
  getHealthcheckIntervalMs(): number;
  getHealthcheckTimer(): NodeJS.Timeout | null;
};

export interface SchedulerHealthcheckDeps {
  runtimeId: string;
}

const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;

export function createSchedulerHealthcheck(
  _deps: SchedulerHealthcheckDeps,
): SchedulerHealthcheck {
  let healthcheckTimer: NodeJS.Timeout | null = null;
  let healthcheckNextAt: number | null = null;

  /**
   * startHealthcheck is a no-op when using external timer management.
   * External code manages the interval via getHealthcheckIntervalMs().
   */
  function startHealthcheck(): void {
    // No-op: external code manages the interval via getHealthcheckIntervalMs()
  }

  function clearHealthcheck(): void {
    if (!healthcheckTimer) {
      return;
    }
    clearInterval(healthcheckTimer);
    healthcheckTimer = null;
  }

  /**
   * External healthcheck interface.
   * shouldRunHealthcheckAt: returns true if a healthcheck should run now.
   * getHealthcheckIntervalMs: returns the interval in ms.
   */
  function shouldRunHealthcheckAt(now: number): boolean {
    if (!healthcheckNextAt) return false;
    return now >= healthcheckNextAt;
  }

  function getHealthcheckIntervalMs(): number {
    return RUNNER_HEALTHCHECK_INTERVAL_MS;
  }

  function getHealthcheckTimer(): NodeJS.Timeout | null {
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
