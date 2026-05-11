import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFlushManager } from './agent-runner-flush-manager';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('agent-runner-flush-manager', () => {
  const RUNTIME_ID = 'test-runtime';

  function makeDeps(overrides: Partial<Parameters<typeof createFlushManager>[0]['deps']> = {}) {
    const getSystemSettings = vi.fn().mockResolvedValue({
      stepDelayEnabled: false,
      memoryLastMessagesFullEnabled: false,
      memoryLastMessagesCount: 20,
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    });

    return { runtimeId: RUNTIME_ID, getSystemSettings, ...overrides };
  }

  describe('createFlushManager', () => {
    it('returns an object with all expected methods', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      expect(fm.refreshRunFlushSettings).toBeDefined();
      expect(fm.resetFlushedRunEventKeys).toBeDefined();
      expect(fm.rememberFlushedRunEventKey).toBeDefined();
      expect(fm.isFlushed).toBeDefined();
      expect(fm.clearFlushHistory).toBeDefined();
      expect(fm.getFlushSettings).toBeDefined();
      expect(fm.getRunLastMessages).toBeDefined();
    });
  });

  describe('refreshRunFlushSettings', () => {
    it('loads settings from getSystemSettings', async () => {
      const getSystemSettings = vi.fn().mockResolvedValue({
        stepDelayEnabled: false,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: 30,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: false,
      });
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await fm.refreshRunFlushSettings();
      expect(getSystemSettings).toHaveBeenCalledTimes(1);
      expect(fm.getFlushSettings()).toEqual({
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: false,
      });
      expect(fm.getRunLastMessages()).toBe(30);
    });

    it('sets runLastMessages to MAX when memoryLastMessagesFullEnabled', async () => {
      const getSystemSettings = vi.fn().mockResolvedValue({
        stepDelayEnabled: false,
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: 5,
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: false,
      });
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await fm.refreshRunFlushSettings();
      expect(fm.getRunLastMessages()).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('defaults runLastMessages to 20 when count not provided', async () => {
      const getSystemSettings = vi.fn().mockResolvedValue({
        stepDelayEnabled: false,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: undefined,
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: false,
      });
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await fm.refreshRunFlushSettings();
      expect(fm.getRunLastMessages()).toBe(20);
    });

    it('is non-fatal when getSystemSettings throws', async () => {
      const getSystemSettings = vi.fn().mockRejectedValue(new Error('network error'));
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await expect(fm.refreshRunFlushSettings()).resolves.not.toThrow();
      expect(fm.getFlushSettings()).toEqual({
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      });
    });
  });

  describe('flush key tracking', () => {
    it('rememberFlushedRunEventKey tracks a key', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      fm.rememberFlushedRunEventKey('key-1');
      expect(fm.isFlushed('key-1')).toBe(true);
      expect(fm.isFlushed('key-2')).toBe(false);
    });

    it('rememberFlushedRunEventKey is idempotent', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      fm.rememberFlushedRunEventKey('key-1');
      fm.rememberFlushedRunEventKey('key-1');
      expect(fm.isFlushed('key-1')).toBe(true);
    });

    it('resetFlushedRunEventKeys clears all keys', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      fm.rememberFlushedRunEventKey('key-1');
      fm.rememberFlushedRunEventKey('key-2');
      fm.resetFlushedRunEventKeys();
      expect(fm.isFlushed('key-1')).toBe(false);
      expect(fm.isFlushed('key-2')).toBe(false);
    });

    it('clearFlushHistory is an alias for resetFlushedRunEventKeys', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      fm.rememberFlushedRunEventKey('key-1');
      fm.clearFlushHistory();
      expect(fm.isFlushed('key-1')).toBe(false);
    });

    it('tracks key order for LRU eviction at 2000 keys', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      for (let i = 0; i < 2001; i++) {
        fm.rememberFlushedRunEventKey(`key-${i}`);
      }
      expect(fm.isFlushed('key-0')).toBe(false);
      expect(fm.isFlushed('key-2000')).toBe(true);
    });

    it('evicts oldest keys on overflow', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      fm.rememberFlushedRunEventKey('key-1');
      fm.rememberFlushedRunEventKey('key-2');
      fm.rememberFlushedRunEventKey('key-3');
      for (let i = 10; i < 2010; i++) {
        fm.rememberFlushedRunEventKey(`key-${i}`);
      }
      expect(fm.isFlushed('key-1')).toBe(false);
      expect(fm.isFlushed('key-2')).toBe(false);
      expect(fm.isFlushed('key-3')).toBe(false);
      expect(fm.isFlushed('key-10')).toBe(true);
    });
  });

  describe('getFlushSettings', () => {
    it('returns a copy of the current settings', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      const settings = fm.getFlushSettings();
      settings.communicationDmFlushingEnabled = false;
      const again = fm.getFlushSettings();
      expect(again.communicationDmFlushingEnabled).toBe(true);
    });

    it('reflects settings loaded by refreshRunFlushSettings', async () => {
      const getSystemSettings = vi.fn().mockResolvedValue({
        stepDelayEnabled: false,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: 20,
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: true,
      });
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await fm.refreshRunFlushSettings();
      expect(fm.getFlushSettings()).toEqual({
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: true,
      });
    });
  });

  describe('getRunLastMessages', () => {
    it('returns default 20 before settings are loaded', () => {
      const deps = makeDeps();
      const fm = createFlushManager(deps);
      expect(fm.getRunLastMessages()).toBe(20);
    });

    it('returns settings value after refreshRunFlushSettings', async () => {
      const getSystemSettings = vi.fn().mockResolvedValue({
        stepDelayEnabled: false,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: 40,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      });
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await fm.refreshRunFlushSettings();
      expect(fm.getRunLastMessages()).toBe(40);
    });

    it('returns MAX_SAFE_INTEGER when full memory is enabled', async () => {
      const getSystemSettings = vi.fn().mockResolvedValue({
        stepDelayEnabled: false,
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: 5,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      });
      const deps = makeDeps({ getSystemSettings });
      const fm = createFlushManager(deps);
      await fm.refreshRunFlushSettings();
      expect(fm.getRunLastMessages()).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
