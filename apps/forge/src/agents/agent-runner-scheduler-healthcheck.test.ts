/**
 * Unit tests for agents/agent-runner-scheduler-healthcheck.ts.
 *
 * Tests the healthcheck lifecycle functions:
 * - startHealthcheck: periodic callback
 * - clearHealthcheck: clears the timer
 * - shouldRunHealthcheckAt(now): checks whether healthcheck is due
 * - getHealthcheckIntervalMs(): returns configured interval
 * - getHealthcheckTimer(): returns the raw timer reference
 *
 * Extracted from agent-runner-scheduler.ts (#2257).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSchedulerHealthcheck } from './agent-runner-scheduler-healthcheck';

describe('createSchedulerHealthcheck', () => {
  const onHealthcheck = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    onHealthcheck.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startHealthcheck', () => {
    it('runs the recovery callback every 30 seconds', async () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1', onHealthcheck });
      h.startHealthcheck();
      expect(h.getHealthcheckTimer()).not.toBeNull();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(onHealthcheck).toHaveBeenCalledOnce();
      h.clearHealthcheck();
    });

    it('does not start more than one interval', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1', onHealthcheck });
      h.startHealthcheck();
      const timer = h.getHealthcheckTimer();
      h.startHealthcheck();
      expect(h.getHealthcheckTimer()).toBe(timer);
      h.clearHealthcheck();
    });
  });

  describe('clearHealthcheck', () => {
    it('is safe to call when timer is null', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1', onHealthcheck });
      expect(() => h.clearHealthcheck()).not.toThrow();
      expect(h.getHealthcheckTimer()).toBeNull();
    });
  });

  describe('shouldRunHealthcheckAt', () => {
    it('returns false when healthcheckNextAt is null', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1', onHealthcheck });
      expect(h.shouldRunHealthcheckAt(Date.now())).toBe(false);
    });
  });

  describe('getHealthcheckIntervalMs', () => {
    it('returns 30_000 ms', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1', onHealthcheck });
      expect(h.getHealthcheckIntervalMs()).toBe(30_000);
    });
  });

  describe('getHealthcheckTimer', () => {
    it('returns null by default', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1', onHealthcheck });
      expect(h.getHealthcheckTimer()).toBeNull();
    });
  });
});
