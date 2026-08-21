/**
 * Tests for Pattern L typed Errors in discord module (D52 #6628 batch 1).
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
  DiscordTargetNotSendableError,
  DiscordUserNotFoundError,
} from './errors';

describe('discord/errors — Pattern L typed Errors (D52 #6628 batch 1)', () => {
  it('DiscordClientNotReadyError preserves verbatim message', () => {
    const error = new DiscordClientNotReadyError();
    expect(error).toBeInstanceOf(DiscordClientNotReadyError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('DISCORD_CLIENT_NOT_READY');
    expect(error.name).toBe('DiscordClientNotReadyError');
    expect(error.message).toBe('Discord client did not become ready after login');
  });

  it('DiscordTargetNotReadableError captures targetKey and preserves message', () => {
    const targetKey = 'ch-12345';
    const error = new DiscordTargetNotReadableError(targetKey);
    expect(error).toBeInstanceOf(DiscordTargetNotReadableError);
    expect(error.code).toBe('DISCORD_TARGET_NOT_READABLE');
    expect(error.targetKey).toBe(targetKey);
    expect(error.message).toBe('Discord target is not readable: ch-12345');
  });

  it('DiscordTargetNotSendableError captures targetKey and preserves message', () => {
    const targetKey = 'ch-99999';
    const error = new DiscordTargetNotSendableError(targetKey);
    expect(error).toBeInstanceOf(DiscordTargetNotSendableError);
    expect(error.code).toBe('DISCORD_TARGET_NOT_SENDABLE');
    expect(error.targetKey).toBe(targetKey);
    expect(error.message).toBe('Discord target is not sendable: ch-99999');
  });

  it('DiscordUserNotFoundError captures targetKey and preserves message', () => {
    const targetKey = 'unknown-user';
    const error = new DiscordUserNotFoundError(targetKey);
    expect(error).toBeInstanceOf(DiscordUserNotFoundError);
    expect(error.code).toBe('DISCORD_USER_NOT_FOUND');
    expect(error.targetKey).toBe(targetKey);
    expect(error.message).toBe('Discord user not found: unknown-user');
  });
});
