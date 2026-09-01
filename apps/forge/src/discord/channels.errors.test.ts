/**
 * Tests for Pattern L typed Errors in discord/channels module (D51 #6502 batch 21).
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
  DiscordTargetNotSendableError,
  DiscordUserNotFoundError,
} from './errors';

describe('discord/channels — Pattern L typed Errors (D51 #6502 batch 21)', () => {
  it('DiscordTargetNotSendableError captures targetKey and preserves message', () => {
    const targetKey = 'ch-99999';
    const error = new DiscordTargetNotSendableError(targetKey);
    expect(error).toBeInstanceOf(DiscordTargetNotSendableError);
    expect(error.code).toBe('DISCORD_TARGET_NOT_SENDABLE');
    expect(error.targetKey).toBe(targetKey);
    expect(error.message).toContain('Discord target is not sendable');
    expect(error.message).toContain(targetKey);
  });

  it('DiscordUserNotFoundError captures targetKey and preserves message', () => {
    const targetKey = 'unknown-user';
    const error = new DiscordUserNotFoundError(targetKey);
    expect(error).toBeInstanceOf(DiscordUserNotFoundError);
    expect(error.code).toBe('DISCORD_USER_NOT_FOUND');
    expect(error.targetKey).toBe(targetKey);
    expect(error.message).toContain('Discord user not found');
    expect(error.message).toContain(targetKey);
  });
});
