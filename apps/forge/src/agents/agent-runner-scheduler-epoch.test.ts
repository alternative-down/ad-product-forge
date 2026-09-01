import { describe, it, expect } from 'vitest';
import {
  startNewRunEpoch,
  isStaleRun,
  advanceStepEpoch,
  getGenerateToken,
  startGenerateAttempt,
  finishGenerateAttempt,
  invalidateInFlightGenerate,
  getAbortController,
  type EpochState,
  type GenControllerState,
} from './agent-runner-scheduler-epoch';

describe('agent-runner-scheduler-epoch', () => {
  // ── Fixtures ────────────────────────────────────────────────────────────────
  const makeState = (run = 0, step = 0, gen = 0): EpochState => ({
    activeRunEpoch: run,
    activeStepEpoch: step,
    activeGenerateToken: gen,
  });

  const makeGenCtrl = (ctrl: AbortController | null = null): GenControllerState => ({
    currentAbortController: ctrl,
  });

  // ── startNewRunEpoch ────────────────────────────────────────────────────────
  describe('startNewRunEpoch', () => {
    it('increments activeRunEpoch', () => {
      const state = makeState(0, 5);
      startNewRunEpoch(state);
      expect(state.activeRunEpoch).toBe(1);
    });

    it('resets activeStepEpoch to 0', () => {
      const state = makeState(0, 7);
      startNewRunEpoch(state);
      expect(state.activeStepEpoch).toBe(0);
    });

    it('returns the new run epoch value', () => {
      const state = makeState(5, 7);
      expect(startNewRunEpoch(state)).toBe(6);
    });
  });

  // ── isStaleRun ─────────────────────────────────────────────────────────────
  describe('isStaleRun', () => {
    it('returns true when stopped', () => {
      const state = makeState(3);
      expect(isStaleRun(state, true, 3)).toBe(true);
    });

    it('returns true when runEpoch does not match', () => {
      const state = makeState(3);
      expect(isStaleRun(state, false, 2)).toBe(true);
    });

    it('returns false when epoch matches and not stopped', () => {
      const state = makeState(3);
      expect(isStaleRun(state, false, 3)).toBe(false);
    });
  });

  // ── advanceStepEpoch ───────────────────────────────────────────────────────
  describe('advanceStepEpoch', () => {
    it('increments activeStepEpoch', () => {
      const state = makeState(1, 2);
      advanceStepEpoch(state);
      expect(state.activeStepEpoch).toBe(3);
    });

    it('returns the new step epoch value', () => {
      const state = makeState(1, 2);
      expect(advanceStepEpoch(state)).toBe(3);
    });

    it('does not affect activeRunEpoch', () => {
      const state = makeState(1, 2);
      advanceStepEpoch(state);
      expect(state.activeRunEpoch).toBe(1);
    });
  });

  // ── getGenerateToken ──────────────────────────────────────────────────────
  describe('getGenerateToken', () => {
    it('returns the activeGenerateToken', () => {
      const state = makeState(1, 2, 42);
      expect(getGenerateToken(state)).toBe(42);
    });
  });

  // ── startGenerateAttempt ────────────────────────────────────────────────────
  describe('startGenerateAttempt', () => {
    it('increments activeGenerateToken', () => {
      const state = makeState(1, 0, 0);
      const genCtrl = makeGenCtrl();
      startGenerateAttempt(state, genCtrl, new AbortController());
      expect(state.activeGenerateToken).toBe(1);
    });

    it('stores the controller', () => {
      const state = makeState(1, 0, 0);
      const genCtrl = makeGenCtrl();
      const ctrl = new AbortController();
      startGenerateAttempt(state, genCtrl, ctrl);
      expect(genCtrl.currentAbortController).toBe(ctrl);
    });

    it('returns the new token', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl();
      expect(startGenerateAttempt(state, genCtrl, new AbortController())).toBe(6);
    });

    it('replaces any previous controller', () => {
      const state = makeState(1, 0, 0);
      const genCtrl = makeGenCtrl();
      const ctrl1 = new AbortController();
      const ctrl2 = new AbortController();
      startGenerateAttempt(state, genCtrl, ctrl1);
      startGenerateAttempt(state, genCtrl, ctrl2);
      expect(genCtrl.currentAbortController).toBe(ctrl2);
    });
  });

  // ── finishGenerateAttempt ─────────────────────────────────────────────────
  describe('finishGenerateAttempt', () => {
    it('aborts the passed controller', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl();
      let abortCalled = false;
      const ctrl = {
        abort: () => {
          abortCalled = true;
        },
        signal: { aborted: false },
      } as unknown as AbortController;
      startGenerateAttempt(state, genCtrl, ctrl);
      finishGenerateAttempt(state, genCtrl, 6, ctrl);
      expect(abortCalled).toBe(true);
    });

    it('clears the stored controller when token matches', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl();
      const ctrl = new AbortController();
      startGenerateAttempt(state, genCtrl, ctrl);
      finishGenerateAttempt(state, genCtrl, 6, ctrl);
      expect(genCtrl.currentAbortController).toBeNull();
    });

    it('aborts even when token is stale (completion signal always fires)', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl();
      let abortCalled = false;
      const ctrl = {
        abort: () => {
          abortCalled = true;
        },
        signal: { aborted: false },
      } as unknown as AbortController;
      startGenerateAttempt(state, genCtrl, ctrl);
      state.activeGenerateToken += 1; // another attempt started (now 7)

      // abort() fires regardless — stale token only prevents currentAbortController from being cleared
      finishGenerateAttempt(state, genCtrl, 6, ctrl);
      expect(abortCalled).toBe(true);
    });

    it('does NOT clear controller when token is stale', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl();
      const ctrl = new AbortController();
      startGenerateAttempt(state, genCtrl, ctrl);
      state.activeGenerateToken += 1; // stale (now 7)

      finishGenerateAttempt(state, genCtrl, 6, ctrl);
      // currentAbortController stays as ctrl because token was stale
      expect(genCtrl.currentAbortController).toBe(ctrl);
    });
  });

  // ── invalidateInFlightGenerate ─────────────────────────────────────────────
  describe('invalidateInFlightGenerate', () => {
    it('increments activeGenerateToken', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl(new AbortController());
      invalidateInFlightGenerate(state, genCtrl);
      expect(state.activeGenerateToken).toBe(6);
    });

    it('aborts the stored controller with descriptive error', () => {
      const state = makeState(1, 0, 5);
      let lastAbortError: Error | undefined;
      const ctrl = {
        abort: (err?: Error) => {
          lastAbortError = err;
        },
        signal: { aborted: false },
      } as unknown as AbortController;
      const genCtrl = makeGenCtrl(ctrl);
      invalidateInFlightGenerate(state, genCtrl);
      expect(lastAbortError).toBeInstanceOf(Error);
      expect(lastAbortError!.message).toBe('Agent generate invalidated');
    });

    it('clears the stored controller', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl(new AbortController());
      invalidateInFlightGenerate(state, genCtrl);
      expect(genCtrl.currentAbortController).toBeNull();
    });

    it('is safe to call when no controller is stored', () => {
      const state = makeState(1, 0, 5);
      const genCtrl = makeGenCtrl(null);
      invalidateInFlightGenerate(state, genCtrl);
      expect(state.activeGenerateToken).toBe(6);
      expect(genCtrl.currentAbortController).toBeNull();
    });
  });

  // ── getAbortController ──────────────────────────────────────────────────────
  describe('getAbortController', () => {
    it('returns the stored controller', () => {
      const genCtrl = makeGenCtrl(null);
      const ctrl = new AbortController();
      genCtrl.currentAbortController = ctrl;
      expect(getAbortController(genCtrl)).toBe(ctrl);
    });

    it('returns null when no controller is stored', () => {
      const genCtrl = makeGenCtrl(null);
      expect(getAbortController(genCtrl)).toBeNull();
    });
  });

  // ── Integration ───────────────────────────────────────────────────────────
  describe('full generate lifecycle', () => {
    // Each test uses a fresh state with unique seed values to avoid any
    // possible collision with other tests sharing the same epoch counters.
    it('tokens increment across the lifecycle', () => {
      const state = makeState(999, 0, 888);
      const genCtrl = makeGenCtrl(null);
      const ctrl = new AbortController();

      // startNewRunEpoch increments runEpoch; does NOT touch activeGenerateToken
      const runEpoch = startNewRunEpoch(state);
      expect(runEpoch).toBe(1000); // 999 + 1
      expect(state.activeGenerateToken).toBe(888); // unchanged

      const genToken1 = startGenerateAttempt(state, genCtrl, ctrl);
      expect(genToken1).toBe(889); // 888 + 1
      expect(state.activeGenerateToken).toBe(889);

      // finishGenerateAttempt does NOT modify activeGenerateToken
      finishGenerateAttempt(state, genCtrl, 889, ctrl);
      expect(state.activeGenerateToken).toBe(889);

      const ctrl2 = new AbortController();
      const genToken2 = startGenerateAttempt(state, genCtrl, ctrl2);
      expect(genToken2).toBe(890); // 889 + 1
      expect(state.activeGenerateToken).toBe(890);
    });

    it('invalidateInFlightGenerate followed by startGenerateAttempt', () => {
      const state = makeState(777, 0, 666);
      const genCtrl = makeGenCtrl(null);
      const ctrl1 = new AbortController();
      const genToken1 = startGenerateAttempt(state, genCtrl, ctrl1);
      expect(genToken1).toBe(667); // 666 + 1

      invalidateInFlightGenerate(state, genCtrl);
      expect(state.activeGenerateToken).toBe(668); // 667 + 1

      const ctrl2 = new AbortController();
      const genToken = startGenerateAttempt(state, genCtrl, ctrl2);
      expect(genToken).toBe(669); // 668 + 1
      expect(genCtrl.currentAbortController).toBe(ctrl2);
    });
  });
});
