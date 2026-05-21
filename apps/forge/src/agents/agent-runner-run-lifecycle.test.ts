import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRunLifecycle } from './agent-runner-run-lifecycle';

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

function makeDeps(stopped = false) {
  return { stopped };
}

describe('agent-runner-run-lifecycle', () => {
  describe('startNewRunEpoch', () => {
    it('increments activeRunEpoch', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      expect(lc.startNewRunEpoch()).toBe(1);
      expect(state.activeRunEpoch).toBe(1);
    });

    it('resets activeStepEpoch to 0', () => {
      const state = makeState();
      state.activeStepEpoch = 5;
      const lc = createRunLifecycle(state, makeDeps());
      lc.startNewRunEpoch();
      expect(state.activeStepEpoch).toBe(0);
    });

    it('returns the new epoch number', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      expect(lc.startNewRunEpoch()).toBe(1);
      expect(lc.startNewRunEpoch()).toBe(2);
      expect(lc.startNewRunEpoch()).toBe(3);
    });
  });

  describe('isStaleRun', () => {
    it('returns true when runEpoch does not match activeRunEpoch', () => {
      const state = makeState();
      state.activeRunEpoch = 3;
      const lc = createRunLifecycle(state, makeDeps());
      expect(lc.isStaleRun(1)).toBe(true);
      expect(lc.isStaleRun(2)).toBe(true);
      expect(lc.isStaleRun(4)).toBe(true);
    });

    it('returns false when runEpoch matches activeRunEpoch', () => {
      const state = makeState();
      state.activeRunEpoch = 2;
      const lc = createRunLifecycle(state, makeDeps());
      expect(lc.isStaleRun(2)).toBe(false);
    });

    it('returns true when stopped is true', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps(true));
      expect(lc.isStaleRun(1)).toBe(true);
      expect(lc.isStaleRun(0)).toBe(true);
    });
  });

  describe('generate token lifecycle', () => {
    it('startGenerateAttempt increments token and stores controller', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      const ctrl = new AbortController();
      expect(lc.startGenerateAttempt(ctrl)).toBe(1);
      expect(state.activeGenerateToken).toBe(1);
    });

    it('finishGenerateAttempt clears controller when token matches', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      const ctrl = new AbortController();
      lc.startGenerateAttempt(ctrl);
      lc.finishGenerateAttempt(1, ctrl);
      expect(state.activeGenerateToken).toBe(1);
    });

    it('finishGenerateAttempt ignores stale token', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      const ctrl1 = new AbortController();
      const ctrl2 = new AbortController();
      lc.startGenerateAttempt(ctrl1);
      // Start a newer attempt
      lc.startGenerateAttempt(ctrl2);
      // Try to finish the old token
      lc.finishGenerateAttempt(1, ctrl1);
      expect(state.activeGenerateToken).toBe(2);
    });

    it('getGenerateToken returns current token', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      expect(lc.getGenerateToken()).toBe(0);
      lc.startGenerateAttempt(new AbortController());
      expect(lc.getGenerateToken()).toBe(1);
    });

    it('startNewRunEpoch increments generate token (invalidation)', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      lc.startGenerateAttempt(new AbortController());
      expect(lc.getGenerateToken()).toBe(1);
      lc.startNewRunEpoch();
      expect(lc.getGenerateToken()).toBe(2);
      expect(abortSpy).toHaveBeenCalled();
    });

    it('invalidateInFlightGenerate aborts current controller', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      const ctrl = new AbortController();
      const abortSpy = vi.spyOn(ctrl, 'abort');
      lc.startGenerateAttempt(ctrl);
      lc.invalidateInFlightGenerate();
      expect(abortSpy).toHaveBeenCalledWith(new Error('Agent generate invalidated'));
    });

    it('invalidateInFlightGenerate increments token', () => {
      const state = makeState();
      const lc = createRunLifecycle(state, makeDeps());
      lc.startGenerateAttempt(new AbortController());
      expect(lc.getGenerateToken()).toBe(1);
      lc.invalidateInFlightGenerate();
      expect(lc.getGenerateToken()).toBe(2);
    });
  });
});
