import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { discordAccountDebug } from './discord-account';
import { forgeDebug } from '@forge-runtime/core';

const mockedForgeDebug = vi.mocked(forgeDebug);

describe('discordAccountDebug', () => {
  beforeEach(() => {
    mockedForgeDebug.mockReset();
  });

  it('forwards level + message to forgeDebug with the canonical scope when context is omitted', () => {
    discordAccountDebug('info', 'message accepted');

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'discord-account',
      level: 'info',
      message: 'message accepted',
      context: undefined,
    });
  });

  it('forwards context object when provided', () => {
    discordAccountDebug('error', 'getMessages discord target not readable', { targetKey: 'ch-1' });

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'discord-account',
      level: 'error',
      message: 'getMessages discord target not readable',
      context: { targetKey: 'ch-1' },
    });
  });

  it('preserves all four level variants', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      discordAccountDebug(level, `sample message at ${level}`, { tag: level });

      expect(mockedForgeDebug).toHaveBeenLastCalledWith({
        scope: 'discord-account',
        level,
        message: `sample message at ${level}`,
        context: { tag: level },
      });
    }
  });

  it('returns void', () => {
    const result = discordAccountDebug('warn', 'scope-check', { x: 1 });
    expect(result).toBeUndefined();
  });
});