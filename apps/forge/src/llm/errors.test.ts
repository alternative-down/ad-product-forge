/**
 * Tests for Pattern L typed Errors in llm module (D52 #6628 batch 2).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields are exposed on the error for downstream consumers
 *
 * See apps/forge/src/llm/errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidAccountModelKeyFormatError,
  InvalidAccountOAuthModelKeyError,
  InvalidMinimaxCodingModelKeyError,
  LlmCannotDeleteSystemDefaultError,
  LlmDefaultProfileMissingOrDisabledError,
  LlmDefaultProfileNotEnabledError,
  LlmProfileDecryptError,
  LlmProfileNotFoundError,
  LlmSystemDefaultsNotConfiguredError,
  UnsupportedOAuthProviderError,
} from './errors';

describe('llm/errors — Pattern L typed Errors (D52 #6628 batch 2)', () => {
  it('LlmSystemDefaultsNotConfiguredError preserves verbatim message', () => {
    const error = new LlmSystemDefaultsNotConfiguredError();
    expect(error).toBeInstanceOf(LlmSystemDefaultsNotConfiguredError);
    expect(error.code).toBe('LLM_SYSTEM_DEFAULTS_NOT_CONFIGURED');
    expect(error.message).toBe('System LLM defaults are not configured');
  });

  describe('LlmDefaultProfileMissingOrDisabledError', () => {
    it('captures role=primary and preserves verbatim message', () => {
      const error = new LlmDefaultProfileMissingOrDisabledError('primary');
      expect(error).toBeInstanceOf(LlmDefaultProfileMissingOrDisabledError);
      expect(error.code).toBe('LLM_DEFAULT_PROFILE_MISSING_OR_DISABLED');
      expect(error.role).toBe('primary');
      expect(error.message).toBe(
        'Default primary LLM profile is missing or disabled',
      );
    });

    it('captures role=om and preserves verbatim message', () => {
      const error = new LlmDefaultProfileMissingOrDisabledError('om');
      expect(error.role).toBe('om');
      expect(error.message).toBe('Default OM LLM profile is missing or disabled');
    });

    it('captures role=hiringRh and preserves verbatim message', () => {
      const error = new LlmDefaultProfileMissingOrDisabledError('hiringRh');
      expect(error.role).toBe('hiringRh');
      expect(error.message).toBe(
        'Default hiring RH LLM profile is missing or disabled',
      );
    });
  });

  describe('LlmProfileNotFoundError', () => {
    it('captures profileId and preserves verbatim message', () => {
      const error = new LlmProfileNotFoundError('profile-42');
      expect(error).toBeInstanceOf(LlmProfileNotFoundError);
      expect(error.code).toBe('LLM_PROFILE_NOT_FOUND');
      expect(error.profileId).toBe('profile-42');
      expect(error.message).toBe('LLM profile not found: profile-42');
    });
  });

  describe('LlmCannotDeleteSystemDefaultError', () => {
    it('captures profileId and preserves verbatim message', () => {
      const error = new LlmCannotDeleteSystemDefaultError('profile-99');
      expect(error).toBeInstanceOf(LlmCannotDeleteSystemDefaultError);
      expect(error.code).toBe('LLM_CANNOT_DELETE_SYSTEM_DEFAULT');
      expect(error.profileId).toBe('profile-99');
      expect(error.message).toBe(
        'Cannot delete an LLM profile that is currently selected as a system default',
      );
    });
  });

  describe('LlmDefaultProfileNotEnabledError', () => {
    it('captures profileId and preserves verbatim message', () => {
      const error = new LlmDefaultProfileNotEnabledError('profile-1');
      expect(error).toBeInstanceOf(LlmDefaultProfileNotEnabledError);
      expect(error.code).toBe('LLM_DEFAULT_PROFILE_NOT_ENABLED');
      expect(error.profileId).toBe('profile-1');
      expect(error.message).toBe('Default LLM profile must be enabled: profile-1');
    });
  });

  describe('LlmProfileDecryptError', () => {
    it('captures profileId and cause, preserves verbatim message', () => {
      const cause = new Error('bad key');
      const error = new LlmProfileDecryptError('profile-7', cause);
      expect(error).toBeInstanceOf(LlmProfileDecryptError);
      expect(error.code).toBe('LLM_PROFILE_DECRYPT');
      expect(error.profileId).toBe('profile-7');
      expect(error.cause).toBe(cause);
      expect(error.message).toBe(
        'Failed to decrypt LLM profile profile-7: bad key',
      );
    });

    it('handles string cause', () => {
      const error = new LlmProfileDecryptError('profile-8', 'unknown error');
      expect(error.cause).toBe('unknown error');
      expect(error.message).toBe(
        'Failed to decrypt LLM profile profile-8: unknown error',
      );
    });
  });

  describe('InvalidAccountOAuthModelKeyError', () => {
    it('captures modelKey and preserves verbatim message', () => {
      const error = new InvalidAccountOAuthModelKeyError('invalid-key');
      expect(error).toBeInstanceOf(InvalidAccountOAuthModelKeyError);
      expect(error.code).toBe('INVALID_ACCOUNT_OAUTH_MODEL_KEY');
      expect(error.modelKey).toBe('invalid-key');
      expect(error.message).toBe('Invalid account OAuth model key: invalid-key');
    });
  });

  describe('UnsupportedOAuthProviderError', () => {
    it('captures providerId and preserves verbatim message', () => {
      const error = new UnsupportedOAuthProviderError('unknown-provider');
      expect(error).toBeInstanceOf(UnsupportedOAuthProviderError);
      expect(error.code).toBe('UNSUPPORTED_OAUTH_PROVIDER');
      expect(error.providerId).toBe('unknown-provider');
      expect(error.message).toBe(
        'Unsupported OAuth providerId: unknown-provider',
      );
    });
  });

  describe('InvalidMinimaxCodingModelKeyError', () => {
    it('captures modelKey and preserves verbatim message', () => {
      const error = new InvalidMinimaxCodingModelKeyError('invalid-coding-key');
      expect(error).toBeInstanceOf(InvalidMinimaxCodingModelKeyError);
      expect(error.code).toBe('INVALID_MINIMAX_CODING_MODEL_KEY');
      expect(error.modelKey).toBe('invalid-coding-key');
      expect(error.message).toBe(
        'Invalid MiniMax coding model key: invalid-coding-key',
      );
    });
  });

  describe('InvalidAccountModelKeyFormatError', () => {
    it('captures modelKey and preserves verbatim message', () => {
      const error = new InvalidAccountModelKeyFormatError('not-in-format');
      expect(error).toBeInstanceOf(InvalidAccountModelKeyFormatError);
      expect(error.code).toBe('INVALID_ACCOUNT_MODEL_KEY_FORMAT');
      expect(error.modelKey).toBe('not-in-format');
      expect(error.message).toBe(
        'Invalid account model key (expected provider/model format): not-in-format',
      );
    });
  });
});
