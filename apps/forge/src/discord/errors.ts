/**
 * Typed Error subclasses for the discord module (Pattern L, D51 #6502 batch 21).
 *
 * Replaces 4 raw `throw new Error(...)` calls across discord-account.ts and
 * discord/channels.ts with 4 typed Error subclasses so consumers can use
 * `err instanceof XError` instead of parsing human-readable messages. See #6502.
 *
 * Migration impact: 4 literal `throw new Error(...)` calls (2 in
 * discord-account.ts + 2 in discord/channels.ts) collapse to 4 typed Error
 * classes. Message format is preserved verbatim for backward compatibility
 * with existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/github/ops/errors.ts (D51 batch 20 — Aldric),
 * apps/forge/src/finance/payment-providers/errors.ts (D51 batch 19 — Aldric).
 */

export class DiscordClientNotReadyError extends Error {
  readonly code = 'DISCORD_CLIENT_NOT_READY' as const;
  constructor() {
    super('Discord client did not become ready after login');
    this.name = 'DiscordClientNotReadyError';
  }
}

export class DiscordTargetNotReadableError extends Error {
  readonly code = 'DISCORD_TARGET_NOT_READABLE' as const;
  readonly targetKey: string;
  constructor(targetKey: string) {
    super(`Discord target is not readable: ${targetKey}`);
    this.name = 'DiscordTargetNotReadableError';
    this.targetKey = targetKey;
  }
}

export class DiscordTargetNotSendableError extends Error {
  readonly code = 'DISCORD_TARGET_NOT_SENDABLE' as const;
  readonly targetKey: string;
  constructor(targetKey: string) {
    super(`Discord target is not sendable: ${targetKey}`);
    this.name = 'DiscordTargetNotSendableError';
    this.targetKey = targetKey;
  }
}

export class DiscordUserNotFoundError extends Error {
  readonly code = 'DISCORD_USER_NOT_FOUND' as const;
  readonly targetKey: string;
  constructor(targetKey: string) {
    super(`Discord user not found: ${targetKey}`);
    this.name = 'DiscordUserNotFoundError';
    this.targetKey = targetKey;
  }
}
