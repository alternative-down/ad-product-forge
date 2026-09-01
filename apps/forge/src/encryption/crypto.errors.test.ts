import { describe, expect, test } from 'vitest';

import {
  InvalidEncryptedInputError,
  InvalidEncryptionKeyLengthError,
  MissingEncryptionKeyError,
} from './crypto.errors';

describe('encryption/crypto errors', () => {
  describe('MissingEncryptionKeyError', () => {
    test('preserves verbatim message', () => {
      const err = new MissingEncryptionKeyError();
      expect(err).toBeInstanceOf(MissingEncryptionKeyError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('MissingEncryptionKeyError');
      expect(err.code).toBe('MISSING_ENCRYPTION_KEY');
      expect(err.message).toBe('ENCRYPTION_KEY environment variable is required');
    });
  });

  describe('InvalidEncryptionKeyLengthError', () => {
    test('preserves verbatim message with 256-bit hint', () => {
      const err = new InvalidEncryptionKeyLengthError(16);
      expect(err).toBeInstanceOf(InvalidEncryptionKeyLengthError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('InvalidEncryptionKeyLengthError');
      expect(err.code).toBe('INVALID_ENCRYPTION_KEY_LENGTH');
      expect(err.actualLength).toBe(16);
      expect(err.message).toContain('ENCRYPTION_KEY must be 256-bit (32 bytes)');
      expect(err.message).toContain('Generate with:');
      expect(err.message).toContain('node -e');
      expect(err.message).toContain('randomBytes(32).toString(\'base64\')');
      expect(err.message).toContain('16 bytes');
    });

    test('handles 64-byte (over-sized) key', () => {
      const err = new InvalidEncryptionKeyLengthError(64);
      expect(err.actualLength).toBe(64);
      expect(err.message).toContain('64 bytes');
    });
  });

  describe('InvalidEncryptedInputError', () => {
    test('preserves verbatim message with size detail', () => {
      const err = new InvalidEncryptedInputError(8);
      expect(err).toBeInstanceOf(InvalidEncryptedInputError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('InvalidEncryptedInputError');
      expect(err.code).toBe('INVALID_ENCRYPTED_INPUT');
      expect(err.actualLength).toBe(8);
      expect(err.minimumLength).toBe(32);
      expect(err.message).toContain('Invalid encrypted input');
      expect(err.message).toContain('IV (16) + ciphertext + authTag (16)');
      expect(err.message).toContain('8 bytes');
      expect(err.message).toContain('minimum 32');
    });

    test('handles zero-length buffer', () => {
      const err = new InvalidEncryptedInputError(0);
      expect(err.actualLength).toBe(0);
      expect(err.message).toContain('0 bytes');
    });

    test('allows custom minimum length', () => {
      const err = new InvalidEncryptedInputError(31, 32);
      expect(err.minimumLength).toBe(32);
    });
  });
});
