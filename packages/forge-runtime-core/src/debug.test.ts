import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forgeDebug, isForgeDebugEnabled } from './debug';

describe('forgeDebug', () => {
  const originalEnv = process.env.FORGE_DEBUG;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.FORGE_DEBUG = '1';
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.FORGE_DEBUG = originalEnv;
    consoleLogSpy.mockRestore();
  });

  describe('3-positional-arg form (existing, backwards compat)', () => {
    it('logs with [forge:scope] prefix when FORGE_DEBUG is enabled', () => {
      forgeDebug('test-scope', 'test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:test-scope]', 'test message');
    });

    it('logs with data argument when provided and non-empty', () => {
      forgeDebug('test-scope', 'test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:test-scope]', 'test message', { key: 'value' });
    });

    it('omits data argument when empty object', () => {
      forgeDebug('test-scope', 'test message', {});
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:test-scope]', 'test message');
    });
  });

  describe('1-object-arg overload (L#NN-50 #18 v10)', () => {
    it('logs with [forge:scope:level] prefix when FORGE_DEBUG is enabled', () => {
      forgeDebug({ scope: 'test-scope', level: 'info', message: 'test message' });
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:test-scope:info]', 'test message');
    });

    it('logs with context when provided and non-empty', () => {
      forgeDebug({
        scope: 'test-scope',
        level: 'warn',
        message: 'test message',
        context: { key: 'value' },
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:test-scope:warn]', 'test message', { key: 'value' });
    });

    it('omits context when empty object', () => {
      forgeDebug({
        scope: 'test-scope',
        level: 'debug',
        message: 'test message',
        context: {},
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:test-scope:debug]', 'test message');
    });

    it('supports all 4 levels: debug, info, warn, error', () => {
      forgeDebug({ scope: 's', level: 'debug', message: 'm' });
      forgeDebug({ scope: 's', level: 'info', message: 'm' });
      forgeDebug({ scope: 's', level: 'warn', message: 'm' });
      forgeDebug({ scope: 's', level: 'error', message: 'm' });
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '[forge:s:debug]', 'm');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '[forge:s:info]', 'm');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '[forge:s:warn]', 'm');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(4, '[forge:s:error]', 'm');
    });

    it('accepts extra top-level fields like agentId (index signature)', () => {
      forgeDebug({
        scope: 'agent-loader',
        level: 'info',
        agentId: 'agent-123',
        message: 'loading agent',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:agent-loader:info]', 'loading agent');
    });
  });

  describe('FORGE_DEBUG gating', () => {
    it('returns early without logging when FORGE_DEBUG is unset', () => {
      process.env.FORGE_DEBUG = undefined;
      forgeDebug('test-scope', 'test message');
      forgeDebug({ scope: 'test-scope', level: 'info', message: 'test message' });
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('returns early when FORGE_DEBUG is empty string', () => {
      process.env.FORGE_DEBUG = '';
      forgeDebug('test-scope', 'test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('enables when FORGE_DEBUG is true', () => {
      process.env.FORGE_DEBUG = 'true';
      forgeDebug({ scope: 's', level: 'info', message: 'm' });
      expect(consoleLogSpy).toHaveBeenCalledWith('[forge:s:info]', 'm');
    });
  });

  describe('isForgeDebugEnabled', () => {
    it('returns true when FORGE_DEBUG=1', () => {
      process.env.FORGE_DEBUG = '1';
      expect(isForgeDebugEnabled()).toBe(true);
    });

    it('returns true when FORGE_DEBUG=true', () => {
      process.env.FORGE_DEBUG = 'true';
      expect(isForgeDebugEnabled()).toBe(true);
    });

    it('returns false when FORGE_DEBUG is unset', () => {
      process.env.FORGE_DEBUG = undefined;
      expect(isForgeDebugEnabled()).toBe(false);
    });

    it('returns false when FORGE_DEBUG=0', () => {
      process.env.FORGE_DEBUG = '0';
      expect(isForgeDebugEnabled()).toBe(false);
    });
  });
});
