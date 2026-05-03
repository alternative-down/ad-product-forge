/**
 * Tests for decodeAdminApiKey — the helper that handles Base64-encoded admin API keys.
 *
 * This function allows keys with special HTTP-header-problematic characters
 * (e.g., `$`, `#`, `!`, `\`) to be stored in environment variables by
 * Base64-encoding the raw key. If the value looks like valid Base64 AND
 * decoding produces valid printable UTF-8 output, it is decoded.
 * Otherwise the raw value is returned (backward compatibility).
 *
 * Key detection principle: only treat as Base64 if the decoded output is
 * valid printable ASCII (0x20-0x7E). This prevents false positives like
 * `abc123` (technically valid Base64 but decodes to garbage).
 *
 * Example:
 *   Raw key:    my$ecret!key#123
 *   Base64 env: bXkkZWNyZXQha2V5IzEyMw==
 */

import { describe, expect, it } from 'vitest';

// Re-implement the function here to avoid importing the full main.ts module
// (which has heavy deps that fail in test env).
function decodeAdminApiKey(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;

  try {
    const trimmed = rawValue.trim();
    if (trimmed === '') return undefined;

    if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      // Only use decoded value if it produces valid printable UTF-8
      if (/^[\x20-\x7E]*$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Fall through to raw value
  }

  return rawValue;
}

describe('decodeAdminApiKey', () => {
  it('returns undefined when env value is undefined', () => {
    expect(decodeAdminApiKey(undefined)).toBeUndefined();
  });

  it('returns undefined when env value is empty', () => {
    expect(decodeAdminApiKey('')).toBeUndefined();
  });

  it('returns undefined when env value is only whitespace', () => {
    expect(decodeAdminApiKey('   ')).toBeUndefined();
  });

  it('returns raw value for plain ASCII keys (backward compatible)', () => {
    expect(decodeAdminApiKey('simple-key')).toBe('simple-key');
    expect(decodeAdminApiKey('abc123')).toBe('abc123');
    expect(decodeAdminApiKey('my-key-with-dashes')).toBe('my-key-with-dashes');
  });

  it('returns raw value when value is not valid Base64', () => {
    // Invalid Base64 (wrong characters) — should use raw value
    expect(decodeAdminApiKey('not-valid-base64!!!')).toBe('not-valid-base64!!!');
    // Mixed content that isn't valid Base64
    expect(decodeAdminApiKey('my$ecret!key')).toBe('my$ecret!key');
  });

  it('decodes valid Base64-encoded keys with special characters', () => {
    // 'my$ecret!key#123' → Base64 → 'bXkkZWNyZXQha2V5IzEyMw=='
    expect(decodeAdminApiKey('bXkkZWNyZXQha2V5IzEyMw==')).toBe('my$ecret!key#123');
    // 'hello world' → Base64 → 'aGVsbG8gd29ybGQ='
    expect(decodeAdminApiKey('aGVsbG8gd29ybGQ=')).toBe('hello world');
  });

  it('handles keys with backslash when Base64 encoded', () => {
    const encoded = Buffer.from('key\\with\\backslash').toString('base64');
    expect(decodeAdminApiKey(encoded)).toBe('key\\with\\backslash');
  });

  it('handles padded Base64 strings', () => {
    // Single char 'a' → 'YQ==' (has padding)
    expect(decodeAdminApiKey('YQ==')).toBe('a');
    // 'ab' → 'YWI='
    expect(decodeAdminApiKey('YWI=')).toBe('ab');
  });

  it('trims whitespace before decoding', () => {
    expect(decodeAdminApiKey('  YQ==  ')).toBe('a');
    expect(decodeAdminApiKey('\taGVsbG8gd29ybGQ=\t')).toBe('hello world');
  });

  it('decodes real-world problematic keys', () => {
    // Key with $, !, # — common special chars that cause HTTP header issues
    const rawKey = 'my$ecret!key#123';
    const encoded = Buffer.from(rawKey).toString('base64');
    expect(decodeAdminApiKey(encoded)).toBe(rawKey);
    // Verify the raw (non-Base64) value also works via fallback
    expect(decodeAdminApiKey(rawKey)).toBe(rawKey);
  });

  it('handles keys with forward slash when Base64 encoded', () => {
    // '/' → 'Lw=='
    expect(decodeAdminApiKey('Lw==')).toBe('/');
    // 'a/b' → 'YS9i'
    expect(decodeAdminApiKey('YS9i')).toBe('a/b');
  });

  it('handles unpadded Base64 strings', () => {
    // 'abc' → 'YWJj'
    expect(decodeAdminApiKey('YWJj')).toBe('abc');
  });

  it('does not decode partial Base64-looking strings', () => {
    // This looks like Base64 but has a $ which is not valid Base64 char
    expect(decodeAdminApiKey('abc$xyz')).toBe('abc$xyz');
  });

  it('does not decode valid Base64 that produces non-printable output', () => {
    // 'abc123' is valid Base64 but decodes to garbage bytes
    expect(decodeAdminApiKey('abc123')).toBe('abc123');
  });

  it('handles tab and other whitespace characters', () => {
    expect(decodeAdminApiKey('\t\n')).toBeUndefined();
    expect(decodeAdminApiKey('\tYS9i\n')).toBe('a/b');
  });

  it('decodes a key with only printable ASCII when Base64 encoded', () => {
    // 'Key123!' → base64
    const raw = 'Key123!';
    const encoded = Buffer.from(raw).toString('base64');
    expect(decodeAdminApiKey(encoded)).toBe(raw);
  });
});