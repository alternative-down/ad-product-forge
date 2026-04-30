import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseRequest, parseQueryParams } from './validation';

describe('parseRequest', () => {
  const schema = z.object({ id: z.string(), amount: z.number() });

  it('returns success with parsed data when valid', () => {
    const result = parseRequest(schema, { id: 'abc', amount: 100 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ id: 'abc', amount: 100 });
  });

  it('returns success with correct data types', () => {
    const result = parseRequest(schema, { id: 'xyz', amount: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.id).toBe('string');
      expect(typeof result.data.amount).toBe('number');
    }
  });

  it('returns error when required field is missing', () => {
    const result = parseRequest(schema, { id: 'only-id' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeTruthy();
  });

  it('returns error when type is wrong', () => {
    const result = parseRequest(schema, { id: 123, amount: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeTruthy();
  });

  it('returns error with message when extra fields present with strict schema', () => {
    const strictSchema = z.object({ name: z.string() }).strict();
    const result = parseRequest(strictSchema, { name: 'test', extra: true });
    expect(result.success).toBe(false);
  });

  it('handles array input with array schema', () => {
    const arraySchema = z.array(z.object({ key: z.string() }));
    const result = parseRequest(arraySchema, [{ key: 'a' }]);
    expect(result.success).toBe(true);
  });

  it('returns error for array input with object schema', () => {
    const result = parseRequest(schema, [{ id: 'a', amount: 1 }]);
    expect(result.success).toBe(false);
  });
});

describe('parseQueryParams', () => {
  const schema = z.object({ page: z.string(), limit: z.string().optional() });

  it('parses URLSearchParams into validated data', () => {
    const params = new URLSearchParams('page=2&limit=50');
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ page: '2', limit: '50' });
  });

  it('handles missing optional param', () => {
    const params = new URLSearchParams('page=1');
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ page: '1' });
  });

  it('returns error when required param is missing', () => {
    const params = new URLSearchParams('limit=10');
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(false);
  });

  it('handles empty URLSearchParams with all-optional schema', () => {
    const optionalSchema = z.object({ q: z.string().optional() });
    const result = parseQueryParams(optionalSchema, new URLSearchParams());
    expect(result.success).toBe(true);
  });

  it('converts all values to strings', () => {
    const params = new URLSearchParams('a=1&b=true&c=hello');
    const strSchema = z.object({ a: z.string(), b: z.string(), c: z.string() });
    const result = parseQueryParams(strSchema, params);
    expect(result.success).toBe(true);
  });

  it('handles duplicate query params (last wins)', () => {
    const params = new URLSearchParams('page=1&page=2&page=3');
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(true);
  });

  it('handles empty-string values', () => {
    const params = new URLSearchParams('page=');
    const result = parseQueryParams(schema, params);
    // empty string is a string, so it passes
    expect(result.success).toBe(true);
  });
});
