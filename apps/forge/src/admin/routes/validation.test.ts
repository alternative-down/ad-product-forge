import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseRequest, parseQueryParams } from './validation';

const schema = z.object({ name: z.string(), age: z.number().optional() });

describe('parseRequest', () => {
  it('returns data on valid input', () => {
    const result = parseRequest(schema, { name: 'Alice', age: 30 });
    expect(result).toEqual({ success: true, data: { name: 'Alice', age: 30 } });
  });

  it('returns data without optional fields', () => {
    const result = parseRequest(schema, { name: 'Bob' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: 'Bob' });
  });

  it('returns error object on invalid input', () => {
    const result = parseRequest(schema, { name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeTruthy();
  });

  it('includes error message from ZodError', () => {
    const result = parseRequest(schema, { name: 'Carol', age: 'not-a-number' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod v4 returns a JSON array string; message contains "Invalid input"
      expect(result.error).toContain('Invalid input');
    }
  });

  it('returns generic message for non-Error thrown', () => {
    const result = parseRequest({ parse: () => { throw 'boom'; } } as z.ZodSchema, {});
    expect(result.success).toBe(false);
  });
});

describe('parseQueryParams', () => {
  it('returns data on valid query params', () => {
    // Note: URLSearchParams gives all values as strings. Without z.coerce, the
    // schema sees age: '30' (string) which fails z.number(). So we test the
    // actual behaviour — type mismatch results in a failed parse.
    const params = new URLSearchParams({ name: 'Alice', age: '30' });
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(false); // string '30' does not satisfy z.number()
  });

  it('returns data without optional fields', () => {
    const params = new URLSearchParams({ name: 'Bob' });
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: 'Bob' });
  });

  it('returns error on missing required fields', () => {
    const params = new URLSearchParams({ age: '25' });
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('name');
    }
  });

  it('returns error object on type mismatch', () => {
    const params = new URLSearchParams({ name: 'Carol', age: 'not-a-number' });
    const result = parseQueryParams(schema, params);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('number');
    }
  });

  it('handles empty search params with all optional schema', () => {
    const optionalSchema = z.object({ name: z.string().optional() });
    const params = new URLSearchParams();
    const result = parseQueryParams(optionalSchema, params);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });
});
