/**
 * agent-runner-timer-manager.ts
 *
 * Manages the step-timer lifecycle: scheduleNextStep, scheduleAt, clearTimer,
 * setNextStepAt, isTimerActive. Extracted from agent-runner-scheduler.ts (#2257).
 */
import { type SchedulerState } from './agent-runner-scheduler';

export type TimerManager = {
  scheduleNextStep(delayMs: number): void;
  scheduleAt(timestamp: number): void;
  clearTimer(): void;
  setNextStepAt(timestamp: number): void;
  isTimerActive(): boolean;
  setStepFn(fn: (runEpoch: number) => Promise<void> | void): void;
};

export function createTimerManager(state: SchedulerState): TimerManager {
  let timer: NodeJS.Timeout | null = null;

  // Step function — set by the scheduler via setStepFn()
  let stepFn: ((runEpoch: number) => Promise<void> | void) | null = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    state.nextStepAt = null;
  }

  function setNextStepAt(timestamp: number) {
    state.nextStepAt = timestamp;
  }

  function isTimerActive(): boolean {
    return timer !== null || state.nextStepAt !== null;
  }

  function scheduleNextStep(delayMs: number) {
    clearTimer();
    state.nextStepAt = Date.now() + delayMs;
    timer = setTimeout(
      () => {
        timer = null;
        state.nextStepAt = null;
        stepFn?.(0);
      },
      Math.max(delayMs, 0),
    );
  }

  function scheduleAt(timestamp: number) {
    clearTimer();
    state.nextStepAt = timestamp;
  }

  function setStepFn(fn: (runEpoch: number) => Promise<void> | void) {
    stepFn = fn;
  }

  return {
    scheduleNextStep,
    scheduleAt,
    clearTimer,
    setNextStepAt,
    isTimerActive,
    setStepFn,
  };
}
