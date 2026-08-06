import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { hiringDebug } from './hiring-requests-handler';
import { forgeDebug } from '@forge-runtime/core';

const mockedForgeDebug = vi.mocked(forgeDebug);

describe('hiringDebug', () => {
  beforeEach(() => {
    mockedForgeDebug.mockReset();
  });

  it('forwards level + message to forgeDebug with the canonical scope when context is omitted', () => {
    hiringDebug('warn', 'hiringRhTool flow rejected');

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'hiring-requests-handler',
      level: 'warn',
      message: 'hiringRhTool flow rejected',
      context: undefined,
    });
  });

  it('forwards context object when provided', () => {
    hiringDebug('info', 'hireAgent success', {
      agentName: 'agent-1',
      roleName: 'role-1',
    });

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'hiring-requests-handler',
      level: 'info',
      message: 'hireAgent success',
      context: { agentName: 'agent-1', roleName: 'role-1' },
    });
  });

  it('passes through all valid forgeDebug levels without mutation', () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;
    for (const level of levels) {
      hiringDebug(level, `sample message at ${level}`, { tag: level });
    }

    expect(mockedForgeDebug).toHaveBeenCalledTimes(4);
    levels.forEach((level, idx) => {
      expect(mockedForgeDebug).toHaveBeenNthCalledWith(idx + 1, {
        scope: 'hiring-requests-handler',
        level,
        message: `sample message at ${level}`,
        context: { tag: level },
      });
    });
  });

  it('does NOT mutate the call site context (must forward by reference only)', () => {
    const ctx = { status: 'active', agentId: 'agent-1' };
    const ctxSnapshot = { ...ctx };

    hiringDebug('warn', 'context-freeze check', ctx);

    expect(ctx).toEqual(ctxSnapshot);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'hiring-requests-handler',
      level: 'warn',
      message: 'context-freeze check',
      context: ctx,
    });
  });

  it('uses a non-empty scope literal (regression guard against scope-string drift)', () => {
    hiringDebug('warn', 'scope-check', { x: 1 });

    const call = mockedForgeDebug.mock.calls[0]?.[0] as unknown as { scope: string };
    expect(typeof call.scope).toBe('string');
    expect(call.scope.length).toBeGreaterThan(0);
    expect(call.scope).toBe('hiring-requests-handler');
  });

  it('returns void (no implicit Promise/forgotten async)', () => {
    const result = hiringDebug('warn', 'returns-void-check', { x: 1 });
    expect(result).toBeUndefined();
  });
});
