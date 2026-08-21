import { describe, expect, it } from 'vitest';
import { CredentialsJsonParseError } from './helpers-schedule-crypto.errors';

describe('CredentialsJsonParseError', () => {
  it('preserves verbatim message format', () => {
    const err = new CredentialsJsonParseError('Unexpected token } in JSON at position 5');
    expect(err).toBeInstanceOf(CredentialsJsonParseError);
    expect(err.name).toBe('CredentialsJsonParseError');
    expect(err.code).toBe('CREDENTIALS_JSON_PARSE_ERROR');
    expect(err.cause).toBe('Unexpected token } in JSON at position 5');
    expect(err.message).toBe('Failed to parse credentials JSON: Unexpected token } in JSON at position 5');
  });
});
