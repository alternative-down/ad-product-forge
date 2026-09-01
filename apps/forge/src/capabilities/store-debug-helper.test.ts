import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { capabilitiesStoreDebug } from './store';
import { forgeDebug } from '@forge-runtime/core';

const mockedForgeDebug = vi.mocked(forgeDebug);

describe('capabilitiesStoreDebug', () => {
  beforeEach(() => {
    mockedForgeDebug.mockReset();
  });

  it('forwards level + message to forgeDebug with the canonical scope when context is omitted', () => {
    capabilitiesStoreDebug('warn', 'requireRole: not found');

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'capabilities-store',
      level: 'warn',
      message: 'requireRole: not found',
      context: undefined,
    });
  });

  it('forwards context object when provided', () => {
    capabilitiesStoreDebug('warn', 'deleteRole: cannot delete role with assigned agents', {
      roleId: 'role-abc',
    });

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'capabilities-store',
      level: 'warn',
      message: 'deleteRole: cannot delete role with assigned agents',
      context: { roleId: 'role-abc' },
    });
  });

  it('passes through all valid forgeDebug levels without mutation', () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;
    for (const level of levels) {
      capabilitiesStoreDebug(level, `sample message at ${level}`, { tag: level });
    }

    expect(mockedForgeDebug).toHaveBeenCalledTimes(4);
    levels.forEach((level, idx) => {
      expect(mockedForgeDebug).toHaveBeenNthCalledWith(idx + 1, {
        scope: 'capabilities-store',
        level,
        message: `sample message at ${level}`,
        context: { tag: level },
      });
    });
  });

  it('does NOT mutate the call site context (must forward by reference only)', () => {
    const ctx = { roleId: 'role-1', agentId: 'agent-1' };
    const ctxSnapshot = { ...ctx };

    capabilitiesStoreDebug('warn', 'context-freeze check', ctx);

    expect(ctx).toEqual(ctxSnapshot);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'capabilities-store',
      level: 'warn',
      message: 'context-freeze check',
      context: ctx,
    });
  });

  it('uses a non-empty scope literal (regression guard against scope-string drift)', () => {
    capabilitiesStoreDebug('warn', 'scope-check', { x: 1 });

    const call = mockedForgeDebug.mock.calls[0]?.[0] as unknown as { scope: string };
    expect(typeof call.scope).toBe('string');
    expect((call.scope as string).length).toBeGreaterThan(0);
    expect(call.scope).toBe('capabilities-store');
  });

  it('returns void (no implicit Promise/forgotten async)', () => {
    const result = capabilitiesStoreDebug('warn', 'returns-void-check', { x: 1 });
    expect(result).toBeUndefined();
  });
});