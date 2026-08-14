import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { forgeDebug } from '@forge-runtime/core';
import { ltmRecallDebug } from './recall-debug';

describe('ltm-recall-debug', () => {
  it('ltmRecallDebug calls forgeDebug with scope ltm-recall and spreads context to top-level', () => {
    vi.mocked(forgeDebug).mockClear();

    ltmRecallDebug('error', 'recall failed', { error: 'oops' });

    expect(forgeDebug).toHaveBeenCalledTimes(1);
    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'ltm-recall',
      level: 'error',
      message: 'recall failed',
      error: 'oops',
    });
  });

  it('ltmRecallDebug omits context in the payload when not provided', () => {
    vi.mocked(forgeDebug).mockClear();

    ltmRecallDebug('warn', 'persistRecallSnapshot failed');

    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'ltm-recall',
      level: 'warn',
      message: 'persistRecallSnapshot failed',
    });
  });

  it('ltmRecallDebug spreads multiple context fields to top-level', () => {
    vi.mocked(forgeDebug).mockClear();

    ltmRecallDebug('warn', 'persistRecallSnapshot failed', {
      threadId: 't-1',
      resourceId: 'r-1',
      error: 'write failed',
    });

    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'ltm-recall',
      level: 'warn',
      message: 'persistRecallSnapshot failed',
      threadId: 't-1',
      resourceId: 'r-1',
      error: 'write failed',
    });
  });
});
