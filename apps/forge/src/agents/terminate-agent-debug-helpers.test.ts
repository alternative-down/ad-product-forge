import { describe, it, expect, vi, beforeEach } from 'vitest';
import { terminateInternalAgentDebug } from './terminate-agent-debug-helpers';
import { forgeDebug } from '@forge-runtime/core';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

describe('terminateInternalAgentDebug', () => {
  beforeEach(() => {
    vi.mocked(forgeDebug).mockClear();
  });

  it('forwards error level with message and context', () => {
    terminateInternalAgentDebug('error', 'terminateAgent DB read failed', {
      agentId: 'agent-1',
      error: 'connection refused',
    });
    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'terminate-agent',
      level: 'error',
      message: 'terminateAgent DB read failed',
      context: { agentId: 'agent-1', error: 'connection refused' },
    });
  });

  it('forwards warn level with empty context', () => {
    terminateInternalAgentDebug('warn', 'agent not found');
    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'terminate-agent',
      level: 'warn',
      message: 'agent not found',
      context: undefined,
    });
  });

  it('bakes in scope terminate-agent (cannot be overridden by caller)', () => {
    terminateInternalAgentDebug('info', 'test message', { key: 'value' });
    const firstCall = vi.mocked(forgeDebug).mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toEqual({
      scope: 'terminate-agent',
      level: 'info',
      message: 'test message',
      context: { key: 'value' },
    });
  });

  it('supports all 4 log levels', () => {
    const levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];
    for (const level of levels) {
      terminateInternalAgentDebug(level, `test ${level}`);
      expect(forgeDebug).toHaveBeenLastCalledWith({
        scope: 'terminate-agent',
        level,
        message: `test ${level}`,
        context: undefined,
      });
    }
    expect(forgeDebug).toHaveBeenCalledTimes(4);
  });
});
