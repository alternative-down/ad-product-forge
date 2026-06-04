import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agents/error-formatting', () => ({
  errorMsg: vi.fn((err: unknown) => `formatted: ${String(err)}`),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { withDbErrorLogging } from './error-logging';
import { forgeDebug } from '@forge-runtime/core';

const mockedForgeDebug = vi.mocked(forgeDebug);

describe('withDbErrorLogging', () => {
  beforeEach(() => {
    mockedForgeDebug.mockReset();
  });

  it('returns the operation result on success', async () => {
    const result = await withDbErrorLogging({
      scope: 'test-store',
      op: 'doThing',
      verb: 'write',
      context: { foo: 'bar' },
      fn: async () => 42,
    });
    expect(result).toBe(42);
    expect(mockedForgeDebug).not.toHaveBeenCalled();
  });

  it('logs via forgeDebug with the legacy format and re-throws on failure', async () => {
    const original = new Error('db connection lost');
    const fn = vi.fn().mockRejectedValue(original);

    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'doThing',
        verb: 'read',
        context: { agentId: 'a1' },
        fn,
      }),
    ).rejects.toBe(original);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'test-store',
      level: 'error',
      message: 'doThing DB read failed',
      context: { agentId: 'a1', error: 'formatted: Error: db connection lost' },
    });
  });

  it('uses "write" verb in the log message for write operations', async () => {
    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'insert',
        verb: 'write',
        context: {},
        fn: async () => {
          throw new Error('insert failed');
        },
      }),
    ).rejects.toThrow('insert failed');

    expect(mockedForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'insert DB write failed',
      }),
    );
  });

  it('preserves non-Error throws (e.g., string, object) without crashing', async () => {
    const weirdError = { code: 'WEIRD', detail: 'something' };
    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'doThing',
        verb: 'read',
        context: {},
        fn: async () => {
          throw weirdError;
        },
      }),
    ).rejects.toBe(weirdError);

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    // errorMsg from error-formatting handles non-Error values
    expect(mockedForgeDebug.mock.calls[0][0].context).toHaveProperty('error');
  });

  it('merges context fields with the error key (error takes precedence on collision)', async () => {
    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'op',
        verb: 'read',
        // Intentionally shadow `error` to verify the helper's spread order
        context: { error: 'old', extra: 1 } as unknown as Record<string, unknown>,
        fn: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    const call = mockedForgeDebug.mock.calls[0]?.[0] as { context: Record<string, unknown> } | undefined;
    expect(call).toBeDefined();
    // `error` is overwritten by the formatted err — the helper's contract.
    expect(call?.context.error).toBe('formatted: Error: boom');
    expect(call?.context.extra).toBe(1);
  });
});
