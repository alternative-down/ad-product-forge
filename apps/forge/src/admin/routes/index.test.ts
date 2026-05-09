/**
 * Unit tests for admin/routes/index.ts
 * Pure utility functions: jsonResponse, parseJsonBody.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonResponse, parseJsonBody } from './index';

describe('jsonResponse', () => {
  it('returns a response object with given status', () => {
    const result = jsonResponse({ ok: true }, 200);
    expect(result.status).toBe(200);
  });

  it('defaults to status 200', () => {
    const result = jsonResponse({ ok: true });
    expect(result.status).toBe(200);
  });

  it('sets content-type to application/json', () => {
    const result = jsonResponse({});
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('sets cache-control to no-store', () => {
    const result = jsonResponse({});
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('stringifies the body', () => {
    const result = jsonResponse({ message: 'hello' });
    expect(result.body).toBe('{"message":"hello"}');
  });

  it('stringifies arrays correctly', () => {
    const result = jsonResponse([1, 2, 3]);
    expect(result.body).toBe('[1,2,3]');
  });

  it('handles string body', () => {
    const result = jsonResponse('plain text');
    expect(result.body).toBe('"plain text"');
  });

  it('handles null body', () => {
    const result = jsonResponse(null);
    expect(result.body).toBe('null');
  });

  it('handles nested object body', () => {
    const result = jsonResponse({ nested: { key: 'value' } });
    expect(result.body).toBe('{"nested":{"key":"value"}}');
  });

  it('uses given status when specified', () => {
    const result = jsonResponse({ error: 'not found' }, 404);
    expect(result.status).toBe(404);
  });
});

describe('parseJsonBody', () => {
  it('parses a valid JSON string against a Zod schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = parseJsonBody('{"name":"Alice","age":30}', schema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns empty object for empty string', () => {
    const schema = z.object({});
    const result = parseJsonBody('', schema);
    expect(result).toEqual({});
  });

  it('returns empty object for whitespace-only string', () => {
    const schema = z.object({});
    const result = parseJsonBody('   ', schema);
    expect(result).toEqual({});
  });

  it('throws ZodError for invalid JSON syntax', () => {
    const schema = z.object({ name: z.string() });
    expect(() => parseJsonBody('{invalid}', schema)).toThrow();
  });

  it('throws ZodError for valid JSON not matching schema', () => {
    const schema = z.object({ name: z.string() });
    expect(() => parseJsonBody('{"name":123}', schema)).toThrow();
  });

  it('parses array schema', () => {
    const schema = z.array(z.number());
    const result = parseJsonBody('[1,2,3]', schema);
    expect(result).toEqual([1, 2, 3]);
  });

  it('parses primitive schema', () => {
    const schema = z.string();
    const result = parseJsonBody('"hello"', schema);
    expect(result).toBe('hello');
  });

  it('handles deeply nested structure', () => {
    const schema = z.object({
      data: z.object({
        items: z.array(
          z.object({ id: z.number(), name: z.string() }),
        ),
      }),
    });
    const input = '{"data":{"items":[{"id":1,"name":"first"},{"id":2,"name":"second"}]}}';
    const result = parseJsonBody(input, schema);
    expect(result).toEqual({
      data: {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
      },
    });
  });
});
