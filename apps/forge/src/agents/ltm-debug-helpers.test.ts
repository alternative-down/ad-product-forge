import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { forgeDebug } from '@forge-runtime/core';
import { ltmAgentWarn, ltmDebug } from './ltm-debug-helpers';

describe('ltm-debug-helpers', () => {
  it('ltmDebug calls forgeDebug with scope ltm and the supplied args', () => {
    vi.mocked(forgeDebug).mockClear();
    const ctx = { agentId: 'a-1', count: 3 };

    ltmDebug('info', 'memory workflow start', ctx);

    expect(forgeDebug).toHaveBeenCalledTimes(1);
    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'ltm',
      level: 'info',
      message: 'memory workflow start',
      context: ctx,
    });
  });

  it('ltmDebug omits context in the payload when not provided', () => {
    vi.mocked(forgeDebug).mockClear();

    ltmDebug('warn', 'runtime not available');

    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'ltm',
      level: 'warn',
      message: 'runtime not available',
      context: undefined,
    });
  });

  it('ltmAgentWarn uses scope agent-ltm and level warn', () => {
    vi.mocked(forgeDebug).mockClear();

    ltmAgentWarn('readSnapshot failed: file missing');

    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'agent-ltm',
      level: 'warn',
      message: 'readSnapshot failed: file missing',
    });
  });
});
