/**
 * Typed Error subclasses for the llm module (Pattern L, D50 cycle 2 batch 2).
 *
 * Replaces 9 raw `throw new Error(...)` calls in apps/forge/src/llm/settings-store.ts
 * with 6 typed Error subclasses so consumers can use `err instanceof XError`
 * instead of parsing human-readable messages. See #6502 cycle 2 batch 2.
 *
 * Pattern reference:
 * - apps/forge/src/schedules/errors.ts (D49 #6522)
 * - apps/forge/src/minimax/errors.ts (D50 #6502 batch 1, Streak 209)
 *
 * Migration impact: 9 throw sites in settings-store.ts collapse to 6 typed
 * Error classes. Message format preserved verbatim for backward compatibility
 * with the 13 `toThrow(...)` assertions in settings-store.test.ts.
 */

import { errorMsg } from '@forge-runtime/core';

export class LlmSystemDefaultsNotConfiguredError extends Error {
  readonly code = 'LLM_SYSTEM_DEFAULTS_NOT_CONFIGURED' as const;
  constructor() {
    super('System LLM defaults are not configured');
    this.name = 'LlmSystemDefaultsNotConfiguredError';
  }
}

export type LlmDefaultRole = 'primary' | 'om' | 'hiringRh';

export class LlmDefaultProfileMissingOrDisabledError extends Error {
  readonly code = 'LLM_DEFAULT_PROFILE_MISSING_OR_DISABLED' as const;
  readonly role: LlmDefaultRole;
  constructor(role: LlmDefaultRole) {
    const roleLabel =
      role === 'primary'
        ? 'primary'
        : role === 'om'
          ? 'OM'
          : 'hiring RH';
    super(`Default ${roleLabel} LLM profile is missing or disabled`);
    this.name = 'LlmDefaultProfileMissingOrDisabledError';
    this.role = role;
  }
}

export class LlmProfileNotFoundError extends Error {
  readonly code = 'LLM_PROFILE_NOT_FOUND' as const;
  readonly profileId: string;
  constructor(profileId: string) {
    super(`LLM profile not found: ${profileId}`);
    this.name = 'LlmProfileNotFoundError';
    this.profileId = profileId;
  }
}

export class LlmCannotDeleteSystemDefaultError extends Error {
  readonly code = 'LLM_CANNOT_DELETE_SYSTEM_DEFAULT' as const;
  readonly profileId: string;
  constructor(profileId: string) {
    super(
      'Cannot delete an LLM profile that is currently selected as a system default',
    );
    this.name = 'LlmCannotDeleteSystemDefaultError';
    this.profileId = profileId;
  }
}

export class LlmDefaultProfileNotEnabledError extends Error {
  readonly code = 'LLM_DEFAULT_PROFILE_NOT_ENABLED' as const;
  readonly profileId: string;
  constructor(profileId: string) {
    super(`Default LLM profile must be enabled: ${profileId}`);
    this.name = 'LlmDefaultProfileNotEnabledError';
    this.profileId = profileId;
  }
}

export class LlmProfileDecryptError extends Error {
  readonly code = 'LLM_PROFILE_DECRYPT' as const;
  readonly profileId: string;
  override readonly cause: unknown;
  constructor(profileId: string, cause: unknown) {
    super(`Failed to decrypt LLM profile ${profileId}: ${errorMsg(cause)}`);
    this.name = 'LlmProfileDecryptError';
    this.profileId = profileId;
    this.cause = cause;
  }
}

// ── Pattern L D51 #6502 batch 12: resolveProfileRuntimeModel typed Errors ──
// See apps/forge/src/llm/runtime-model.ts for the source throw sites.
// Message strings preserved verbatim for backward compatibility with
// runtime-model.test.ts assertions.

export class InvalidAccountOAuthModelKeyError extends Error {
  readonly code = 'INVALID_ACCOUNT_OAUTH_MODEL_KEY' as const;
  readonly modelKey: string;
  constructor(modelKey: string) {
    super(`Invalid account OAuth model key: ${modelKey}`);
    this.name = 'InvalidAccountOAuthModelKeyError';
    this.modelKey = modelKey;
  }
}

export class UnsupportedOAuthProviderError extends Error {
  readonly code = 'UNSUPPORTED_OAUTH_PROVIDER' as const;
  readonly providerId: string;
  constructor(providerId: string) {
    super(`Unsupported OAuth providerId: ${providerId}`);
    this.name = 'UnsupportedOAuthProviderError';
    this.providerId = providerId;
  }
}

export class InvalidMinimaxCodingModelKeyError extends Error {
  readonly code = 'INVALID_MINIMAX_CODING_MODEL_KEY' as const;
  readonly modelKey: string;
  constructor(modelKey: string) {
    super(`Invalid MiniMax coding model key: ${modelKey}`);
    this.name = 'InvalidMinimaxCodingModelKeyError';
    this.modelKey = modelKey;
  }
}

export class InvalidAccountModelKeyFormatError extends Error {
  readonly code = 'INVALID_ACCOUNT_MODEL_KEY_FORMAT' as const;
  readonly modelKey: string;
  constructor(modelKey: string) {
    super(
      `Invalid account model key (expected provider/model format): ${modelKey}`,
    );
    this.name = 'InvalidAccountModelKeyFormatError';
    this.modelKey = modelKey;
  }
}
