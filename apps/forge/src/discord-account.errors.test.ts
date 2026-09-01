/**
 * Tests for Pattern L typed Errors in discord-account module (D51 #6502 batch 21).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (targetKey) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/discord/errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  DiscordClientNotReadyError,
  DiscordTargetNotReadableError,
} from './discord/errors';

describe('discord-account — Pattern L typed Errors (D51 #6502 batch 21)', () => {
  it('DiscordClientNotReadyError has discriminator and preserved message', () => {
    const error = new DiscordClientNotReadyError();
    expect(error).toBeInstanceOf(DiscordClientNotReadyError);
    expect(error.code).toBe('DISCORD_CLIENT_NOT_READY');
    expect(error.message).toBe('Discord client did not become ready after login');
  });

  it('DiscordTargetNotReadableError captures targetKey and preserves message', () => {
    const targetKey = 'ch-12345';
    const error = new DiscordTargetNotReadableError(targetKey);
    expect(error).toBeInstanceOf(DiscordTargetNotReadableError);
    expect(error.code).toBe('DISCORD_TARGET_NOT_READABLE');
    expect(error.targetKey).toBe(targetKey);
    expect(error.message).toContain('Discord target is not readable');
    expect(error.message).toContain(targetKey);
  });
});
