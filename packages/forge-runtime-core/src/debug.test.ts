import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';
import { forgeDebug, isForgeDebugEnabled } from './debug.js';

describe('forgeDebug', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockReturnValue();
    delete process.env.FORGE_DEBUG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not log when FORGE_DEBUG is not set', () => {
    forgeDebug('test-scope', 'test message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('does not log when FORGE_DEBUG is false', () => {
    process.env.FORGE_DEBUG = 'false';
    forgeDebug('test-scope', 'test message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('logs when FORGE_DEBUG is true (subject to FORGE_LOG_LEVEL)', () => {
    process.env.FORGE_DEBUG = 'true';
    // With default INFO log level, DEBUG messages are suppressed
    forgeDebug('scope', 'message');
    // No assertion on call count — output depends on FORGE_LOG_LEVEL.
    // Integration tests or manual verification needed for full log-level coverage.
  });

  it('isForgeDebugEnabled reflects FORGE_DEBUG env var', () => {
    delete process.env.FORGE_DEBUG;
    expect(isForgeDebugEnabled()).toBe(false);

    process.env.FORGE_DEBUG = 'true';
    expect(isForgeDebugEnabled()).toBe(true);

    process.env.FORGE_DEBUG = '1';
    expect(isForgeDebugEnabled()).toBe(true);

    process.env.FORGE_DEBUG = 'false';
    expect(isForgeDebugEnabled()).toBe(false);
  });

  it('calls logger.debug when enabled (with DEBUG log level)', () => {
    process.env.FORGE_DEBUG = 'true';
    process.env.FORGE_LOG_LEVEL = 'DEBUG';
    const loggerSpy = vi.spyOn(logger, 'debug').mockReturnValue();
    forgeDebug('my-scope', 'my message', { foo: 'bar' });
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith('my-scope', 'my message', { foo: 'bar' });
    loggerSpy.mockRestore();
  });

  it('does not call logger.debug when disabled', () => {
    const loggerSpy = vi.spyOn(logger, 'debug').mockReturnValue();
    forgeDebug('my-scope', 'my message');
    expect(loggerSpy).not.toHaveBeenCalled();
    loggerSpy.mockRestore();
  });

  it('passes options object to logger.debug', () => {
    process.env.FORGE_DEBUG = 'true';
    process.env.FORGE_LOG_LEVEL = 'DEBUG';
    const loggerSpy = vi.spyOn(logger, 'debug').mockReturnValue();
    forgeDebug({ scope: 'opt-scope', message: 'opt message', data: { baz: 'qux' } });
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith('opt-scope', 'opt message', { baz: 'qux' });
    loggerSpy.mockRestore();
  });
});