import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createGenerateTimeoutGuard,
  touchGenerateTimeout,
  clearGenerateTimeout,
  type GenerateTimeoutHandle,
} from './agent-runner-generate-timeout';

const GENERATE_TIMEOUT_MS = 15 * 60 * 1000;

describe('agent-runner-generate-timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  describe('createGenerateTimeoutGuard', () => {
    it('returns a handle with null timeoutId initially', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      expect(handle.timeoutId).toBeNull();
    });

    it('has a rejectTimeout function', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      expect(typeof handle.rejectTimeout).toBe('function');
    });

    it('has a promise that never resolves on its own', async () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      let resolved = false;
      handle.promise.then(() => {
        resolved = true;
      });
      vi.advanceTimersByTime(1);
      await vi.advanceTimersToNextTimerAsync();
      expect(resolved).toBe(false);
    });

    it('allows setting timeoutId', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      const fakeTimer = { ref: vi.fn(), unref: vi.fn() } as unknown as NodeJS.Timeout;
      handle.timeoutId = fakeTimer;
      expect(handle.timeoutId).toBe(fakeTimer);
    });
  });

  describe('touchGenerateTimeout', () => {
    it('sets a timer on the handle', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      touchGenerateTimeout(handle, controller, null, null);
      expect(handle.timeoutId).not.toBeNull();
    });

    it('clears previous timer before setting a new one', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      touchGenerateTimeout(handle, controller, null, null);
      const firstTimer = handle.timeoutId;
      vi.advanceTimersByTime(100);
      touchGenerateTimeout(handle, controller, null, null);
      expect(handle.timeoutId).not.toBe(firstTimer);
    });

    it('rejects the handle promise on timeout', async () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      touchGenerateTimeout(handle, controller, null, null);

      let rejectedError: Error | undefined;
      handle.promise.catch((err) => {
        rejectedError = err as Error;
      });

      vi.advanceTimersByTime(GENERATE_TIMEOUT_MS);
      await vi.advanceTimersToNextTimerAsync();

      expect(rejectedError).toBeDefined();
      expect(rejectedError?.message).toContain('timed out');
      expect(controller.signal.aborted).toBe(true);
    });

    it('attaches lastStepStage and lastGenerateProgress to the error context', async () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      const progress = { stage: 'generate', at: 1234, detail: { tokens: 42 } };
      touchGenerateTimeout(handle, controller, 'building-prompt', progress);

      let rejectedError: Error | undefined;
      handle.promise.catch((err) => {
        rejectedError = err as Error;
      });

      vi.advanceTimersByTime(GENERATE_TIMEOUT_MS);
      await vi.advanceTimersToNextTimerAsync();

      const err = rejectedError as Error & { context?: Record<string, unknown> };
      expect(err.context).toBeDefined();
      expect(err.context?.lastStepStage).toBe('building-prompt');
      expect(err.context?.lastGenerateProgress).toEqual(progress);
    });
  });

  describe('clearGenerateTimeout', () => {
    it('clears the timer and sets timeoutId to null', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      touchGenerateTimeout(handle, controller, null, null);
      expect(handle.timeoutId).not.toBeNull();
      clearGenerateTimeout(handle);
      expect(handle.timeoutId).toBeNull();
    });

    it('is a no-op when no timer is set', () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      expect(() => clearGenerateTimeout(handle)).not.toThrow();
    });

    it('prevents the pending rejection from firing', async () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      touchGenerateTimeout(handle, controller, null, null);
      clearGenerateTimeout(handle);

      let rejected = false;
      handle.promise.catch(() => {
        rejected = true;
      });

      vi.advanceTimersByTime(GENERATE_TIMEOUT_MS);
      await vi.advanceTimersToNextTimerAsync();

      expect(rejected).toBe(false);
      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('touch-clear-touch chain', () => {
    it('resumes timeout after a clear', async () => {
      const controller = new AbortController();
      const handle = createGenerateTimeoutGuard(controller);
      touchGenerateTimeout(handle, controller, null, null);
      clearGenerateTimeout(handle);
      touchGenerateTimeout(handle, controller, null, null);

      let rejected: Error | undefined;
      handle.promise.catch((err) => {
        rejected = err as Error;
      });

      vi.advanceTimersByTime(GENERATE_TIMEOUT_MS);
      await vi.advanceTimersToNextTimerAsync();

      expect(rejected).toBeDefined();
    });
  });
});
