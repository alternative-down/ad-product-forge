import { describe, expect, it, vi } from 'vitest';
import { serializeError, logError, logErrorViaForgeDebug, withErrorLogging, withErrorLoggingSync } from './debug-error';

const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  logger: { error: mockLoggerError },
}));

describe('serializeError', () => {
  it('serializes Error with name, message, and stack', () => {
    const err = new Error('something went wrong');
    const result = serializeError(err);
    expect(result).toMatchObject({ name: 'Error', message: 'something went wrong' });
    expect(result.stack).toBeDefined();
  });

  it('serializes non-Error as { value: string }', () => {
    expect(serializeError('not an error')).toEqual({ value: 'not an error' });
    expect(serializeError(null)).toEqual({ value: 'null' });
    expect(serializeError(42)).toEqual({ value: '42' });
  });
});

describe('logError', () => {
  it('calls logger.error with scope, message, and context', () => {
    logError({ scope: 'test-scope', message: 'Test error message', context: { error: 'oops' } });
    expect(mockLoggerError).toHaveBeenCalledWith('test-scope', 'Test error message', { error: 'oops' });
  });

  it('passes error object through context', () => {
    const err = new Error('db failed');
    logError({ scope: 'db', message: 'query failed', context: { error: err } });
    expect(mockLoggerError).toHaveBeenCalledWith('db', 'query failed', { error: err });
  });
});

describe('logErrorViaForgeDebug', () => {
  it('calls forgeDebug with scope, message, and spread context', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    logErrorViaForgeDebug({ scope: 'test', message: 'via forgeDebug', context: { error: 'fail' } });
    expect(forgeDebug).toHaveBeenCalledWith({ scope: 'test', message: 'via forgeDebug', error: 'fail' });
  });
});

describe('withErrorLogging', () => {
  it('returns the result of the wrapped async function', async () => {
    mockLoggerError.mockClear();
    const fn = vi.fn().mockResolvedValue(42);
    const result = await withErrorLogging('scope', 'message', fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs and re-throws when the wrapped async function throws', async () => {
    mockLoggerError.mockClear();
    const err = new Error('async failure');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withErrorLogging('scope', 'msg', fn)).rejects.toThrow('async failure');
    expect(mockLoggerError).toHaveBeenCalledWith('scope', 'msg', { error: err });
  });

  it('includes extra context in log', async () => {
    mockLoggerError.mockClear();
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await expect(withErrorLogging('scope', 'msg', fn, { agentId: 'agent-1' })).rejects.toThrow();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'scope', 'msg', { agentId: 'agent-1', error: expect.any(Error) },
    );
  });
});

describe('withErrorLoggingSync', () => {
  it('returns the result of the wrapped sync function', () => {
    mockLoggerError.mockClear();
    const fn = vi.fn(() => 'sync-result');
    const result = withErrorLoggingSync('scope', 'message', fn);
    expect(result).toBe('sync-result');
    expect(fn).toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs and re-throws when the wrapped sync function throws', () => {
    mockLoggerError.mockClear();
    const err = new Error('sync failure');
    const fn = vi.fn(() => { throw err; });
    expect(() => withErrorLoggingSync('scope', 'msg', fn)).toThrow('sync failure');
    expect(mockLoggerError).toHaveBeenCalledWith('scope', 'msg', { error: err });
  });
});