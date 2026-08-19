import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migaduManagerDebug } from './migadu-manager-debug';

vi.mock('@forge-runtime/core', async () => {
  const actual = await vi.importActual<typeof import('@forge-runtime/core')>('@forge-runtime/core');
  return {
    ...actual,
    forgeDebug: vi.fn(),
  };
});

import { forgeDebug } from '@forge-runtime/core';

describe('migaduManagerDebug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards fixed scope and tagged message to forgeDebug positionally', () => {
    migaduManagerDebug('error', 'isConfigured failed: timeout');
    expect(forgeDebug).toHaveBeenCalledWith('migadu-manager', '[error] isConfigured failed: timeout');
  });

  it('forwards context as third positional argument when provided', () => {
    migaduManagerDebug('error', 'delete mailbox failed', { status: 500 });
    expect(forgeDebug).toHaveBeenCalledWith(
      'migadu-manager',
      '[error] delete mailbox failed',
      { status: 500 },
    );
  });

  it('omits third positional argument when context is undefined', () => {
    migaduManagerDebug('warn', 'retry attempt');
    expect(forgeDebug).toHaveBeenCalledWith('migadu-manager', '[warn] retry attempt');
  });

  it('encodes each log level into the message prefix verbatim', () => {
    const levels = ['error', 'warn', 'info', 'debug'] as const;
    for (const level of levels) {
      vi.clearAllMocks();
      migaduManagerDebug(level, 'level-test');
      expect(forgeDebug).toHaveBeenCalledWith('migadu-manager', '[' + level + '] level-test');
    }
  });

  it('returns void and does not throw when called with minimal args', () => {
    expect(() => migaduManagerDebug('info', 'boot')).not.toThrow();
  });

  it('does not mutate the supplied context object', () => {
    const ctx = { status: 500 };
    migaduManagerDebug('error', 'load mailbox failed', ctx);
    expect(ctx).toEqual({ status: 500 });
  });
});
