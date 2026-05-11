import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTimerManager } from './agent-runner-timer-manager';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function makeState() {
  return {
    nextStepAt: null as number | null,
    backoffMs: 60_000,
    instant: false,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    isStopped: false,
  };
}

describe('agent-runner-timer-manager', () => {
  describe('scheduleNextStep', () => {
    it('sets nextStepAt to now + delayMs', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      tm.scheduleNextStep(5000);
      expect(state.nextStepAt).toBeGreaterThan(Date.now());
      expect(state.nextStepAt).toBeLessThanOrEqual(Date.now() + 5000);
    });

    it('does not crash on a negative delay', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      expect(() => tm.scheduleNextStep(-1000)).not.toThrow();
      expect(state.nextStepAt).toBe(Date.now() - 1000);
    });

    it('fires stepFn after the delay', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const stepFn = vi.fn();
      tm.setStepFn(stepFn);
      tm.scheduleNextStep(5000);
      await vi.advanceTimersByTimeAsync(5000);
      expect(stepFn).toHaveBeenCalledTimes(1);
    });

    it('does not fire stepFn if clearTimer is called first', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const stepFn = vi.fn();
      tm.setStepFn(stepFn);
      tm.scheduleNextStep(5000);
      tm.clearTimer();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(stepFn).not.toHaveBeenCalled();
    });

    it('last scheduleNextStep wins when called multiple times', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      tm.setStepFn(fn1);
      tm.scheduleNextStep(10);
      tm.setStepFn(fn2);
      tm.scheduleNextStep(30);
      await vi.advanceTimersByTimeAsync(40);
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduleAt', () => {
    it('sets nextStepAt to the given timestamp', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const ts = Date.now() + 30_000;
      tm.scheduleAt(ts);
      expect(state.nextStepAt).toBe(ts);
    });

    it('clears any existing timer when called', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const fn = vi.fn();
      tm.setStepFn(fn);
      tm.scheduleNextStep(5000);
      tm.scheduleAt(Date.now() + 10_000);
      await vi.advanceTimersByTimeAsync(6000);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('clearTimer', () => {
    it('clears pending timer and nulls nextStepAt', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      tm.scheduleNextStep(5000);
      tm.clearTimer();
      expect(state.nextStepAt).toBeNull();
      expect(tm.isTimerActive()).toBe(false);
    });

    it('is safe to call when no timer is active', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      expect(() => tm.clearTimer()).not.toThrow();
    });
  });

  describe('setNextStepAt', () => {
    it('sets nextStepAt without scheduling a timer', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const ts = Date.now() + 60_000;
      tm.setNextStepAt(ts);
      expect(state.nextStepAt).toBe(ts);
      expect(tm.isTimerActive()).toBe(true);
    });
  });

  describe('isTimerActive', () => {
    it('returns false initially', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      expect(tm.isTimerActive()).toBe(false);
    });

    it('returns true when a timer is scheduled', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      tm.scheduleNextStep(5000);
      expect(tm.isTimerActive()).toBe(true);
    });

    it('returns true when nextStepAt is set but no timer is running', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      tm.setNextStepAt(Date.now() + 60_000);
      expect(tm.isTimerActive()).toBe(true);
    });

    it('returns false after clearTimer', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      tm.scheduleNextStep(5000);
      tm.clearTimer();
      expect(tm.isTimerActive()).toBe(false);
    });

    it('returns false after timer fires', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      tm.scheduleNextStep(5);
      await vi.advanceTimersByTimeAsync(10);
      expect(tm.isTimerActive()).toBe(false);
    });
  });

  describe('setStepFn', () => {
    it('stores the step function and fires it on scheduleNextStep', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const fn = vi.fn();
      tm.setStepFn(fn);
      tm.scheduleNextStep(5);
      await vi.advanceTimersByTimeAsync(10);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('overwrites the previous step function', async () => {
      const state = makeState();
      const tm = createTimerManager(state);
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      tm.setStepFn(fn1);
      tm.scheduleNextStep(10);
      tm.setStepFn(fn2);
      tm.scheduleNextStep(30);
      await vi.advanceTimersByTimeAsync(40);
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });
});