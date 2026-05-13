import { describe, it, expect } from 'vitest';
import {
  createRunEpochState,
  createBackoffState,
  createProgressState,
  advanceRunEpoch,
  advanceStepEpoch,
  advanceGenerateToken,
  isStaleRun,
  nextBackoff,
  resetBackoff,
  calculateDelayMs,
} from './agent-runner-epoch-manager';

describe('agent-runner-epoch-manager', () => {
  describe('RunEpochState', () => {
    it('createRunEpochState returns initial zero state', () => {
      const state = createRunEpochState();
      expect(state.activeRunEpoch).toBe(0);
      expect(state.activeStepEpoch).toBe(0);
      expect(state.activeGenerateToken).toBe(0);
      expect(state.activeRunId).toBeNull();
    });

    it('advanceRunEpoch increments run epoch and resets step/generate', () => {
      const state = createRunEpochState();
      state.activeRunEpoch = 5;
      state.activeStepEpoch = 3;
      state.activeGenerateToken = 7;
      state.activeRunId = 'run-123';

      const result = advanceRunEpoch(state);

      expect(result).toBe(6);
      expect(state.activeRunEpoch).toBe(6);
      expect(state.activeStepEpoch).toBe(0);
      expect(state.activeGenerateToken).toBe(0);
      expect(state.activeRunId).toBeNull();
    });

    it('advanceStepEpoch increments step epoch and resets generate token', () => {
      const state = createRunEpochState();
      state.activeStepEpoch = 2;
      state.activeGenerateToken = 5;

      const result = advanceStepEpoch(state);

      expect(result).toBe(3);
      expect(state.activeStepEpoch).toBe(3);
      expect(state.activeGenerateToken).toBe(0);
    });

    it('advanceGenerateToken increments token counter', () => {
      const state = createRunEpochState();
      state.activeGenerateToken = 4;

      const result = advanceGenerateToken(state);

      expect(result).toBe(5);
      expect(state.activeGenerateToken).toBe(5);
    });

    it('isStaleRun returns true for old epoch', () => {
      const state = createRunEpochState();
      state.activeRunEpoch = 3;

      expect(isStaleRun(state, 2)).toBe(true);
      expect(isStaleRun(state, 3)).toBe(false);
      expect(isStaleRun(state, 4)).toBe(true);
    });
  });

  describe('BackoffState', () => {
    it('createBackoffState returns initial default values', () => {
      const state = createBackoffState();
      expect(state.backoffMs).toBe(60_000);
      expect(state.instant).toBe(false);
      expect(state.nextStepAt).toBeNull();
    });

    it('nextBackoff doubles backoff, capped at 5 minutes', () => {
      const state = createBackoffState();
      state.backoffMs = 30_000;

      expect(nextBackoff(state)).toBe(60_000);
      expect(state.backoffMs).toBe(60_000);

      expect(nextBackoff(state)).toBe(120_000);
      expect(nextBackoff(state)).toBe(240_000);
      expect(nextBackoff(state)).toBe(300_000);

      // Capped — stays at max
      expect(nextBackoff(state)).toBe(300_000);
    });

    it('resetBackoff restores default values', () => {
      const state = createBackoffState();
      state.backoffMs = 240_000;
      state.instant = true;

      resetBackoff(state);

      expect(state.backoffMs).toBe(60_000);
      expect(state.instant).toBe(false);
    });

    it('calculateDelayMs returns 0 when stop requested', () => {
      const state = createBackoffState();
      const result = calculateDelayMs(state, {
        hasPendingMessages: true,
        stopRequested: true,
        hasNewEvents: false,
      });
      expect(result).toBe(0);
      expect(state.nextStepAt).toBeNull();
    });

    it('calculateDelayMs returns 0 when no pending messages', () => {
      const state = createBackoffState();
      const result = calculateDelayMs(state, {
        hasPendingMessages: false,
        stopRequested: false,
        hasNewEvents: true,
      });
      expect(result).toBe(0);
    });

    it('calculateDelayMs returns 0 for new events (instant)', () => {
      const state = createBackoffState();
      const result = calculateDelayMs(state, {
        hasPendingMessages: true,
        stopRequested: false,
        hasNewEvents: true,
      });
      expect(result).toBe(0);
      expect(state.nextStepAt).toBe(Date.now());
    });

    it('calculateDelayMs returns positive delay for backoff', () => {
      const state = createBackoffState();
      state.nextStepAt = null;
      const result = calculateDelayMs(state, {
        hasPendingMessages: true,
        stopRequested: false,
        hasNewEvents: false,
      });
      expect(result).toBeGreaterThan(0);
      expect(state.nextStepAt).not.toBeNull();
    });
  });

  describe('ProgressState', () => {
    it('createProgressState returns initial null state', () => {
      const state = createProgressState();
      expect(state.lastStepStartedAt).toBeNull();
      expect(state.lastStepStage).toBeNull();
    });
  });
});