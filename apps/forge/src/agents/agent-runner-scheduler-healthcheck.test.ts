/**
 * Unit tests for agents/agent-runner-scheduler-healthcheck.ts.
 *
 * Tests the healthcheck lifecycle functions:
 * - startHealthcheck: no-op
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startHealthcheck', () => {
    it('is a no-op', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1' });
      h.startHealthcheck();
      expect(h.getHealthcheckTimer()).toBeNull();
    });
  });

  describe('clearHealthcheck', () => {
    it('is safe to call when timer is null', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1' });
      expect(() => h.clearHealthcheck()).not.toThrow();
      expect(h.getHealthcheckTimer()).toBeNull();
    });
  });

  describe('shouldRunHealthcheckAt', () => {
    it('returns false when healthcheckNextAt is null', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1' });
      expect(h.shouldRunHealthcheckAt(Date.now())).toBe(false);
    });
  });

  describe('getHealthcheckIntervalMs', () => {
    it('returns 30_000 ms', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1' });
      expect(h.getHealthcheckIntervalMs()).toBe(30_000);
    });
  });

  describe('getHealthcheckTimer', () => {
    it('returns null by default', () => {
      const h = createSchedulerHealthcheck({ runtimeId: 'agent-1' });
      expect(h.getHealthcheckTimer()).toBeNull();
    });
  });
});
