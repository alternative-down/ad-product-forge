import { describe, expect, test } from 'vitest';
import {
  NormalizeJsonTextInvalidJsonError,
  NormalizeJsonTextInvalidShapeError,
  ParseJsonBodyInvalidJsonError,
} from './errors';

// ── Pattern L D51 #6502 batch 17: typed-Error class tests ──
// Unit tests for admin/routes/helpers.ts throw-site replacements.

describe('NormalizeJsonTextInvalidJsonError', () => {
  test('preserves fieldName and Error cause message', () => {
    const cause = new SyntaxError('Unexpected token');
    const err = new NormalizeJsonTextInvalidJsonError('payload', cause);
    expect(err.name).toBe('NormalizeJsonTextInvalidJsonError');
    expect(err.code).toBe('NORMALIZE_JSON_TEXT_INVALID_JSON');
    expect(err.fieldName).toBe('payload');
    expect(err.originalError).toBe(cause);
    expect(err.message).toBe('payload must be valid JSON: Unexpected token');
  });
});

describe('NormalizeJsonTextInvalidShapeError', () => {
  test('preserves fieldName and expectedShape', () => {
    const err = new NormalizeJsonTextInvalidShapeError('payload', 'object');
    expect(err.name).toBe('NormalizeJsonTextInvalidShapeError');
    expect(err.code).toBe('NORMALIZE_JSON_TEXT_INVALID_SHAPE');
    expect(err.fieldName).toBe('payload');
    expect(err.expectedShape).toBe('object');
    expect(err.message).toBe('payload must be a JSON object');
  });

  test('handles array shape', () => {
    const err = new NormalizeJsonTextInvalidShapeError('tags', 'array');
    expect(err.expectedShape).toBe('array');
    expect(err.message).toBe('tags must be a JSON array');
  });
});

describe('ParseJsonBodyInvalidJsonError', () => {
  test('preserves Error cause', () => {
    const cause = new SyntaxError('JSON parse failure');
    const err = new ParseJsonBodyInvalidJsonError(cause);
    expect(err.name).toBe('ParseJsonBodyInvalidJsonError');
    expect(err.code).toBe('PARSE_JSON_BODY_INVALID_JSON');
    expect(err.originalError).toBe(cause);
    expect(err.message).toBe('Invalid JSON body: JSON parse failure');
  });
});
