import { describe, expect, test } from 'vitest';
import { jsonResponse, parseJsonBody } from './index';
import { z, ZodError } from 'zod';

describe('jsonResponse', () => {
  test('returns default status 200 with JSON body', () => {
    const result = jsonResponse({ ok: true });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
    expect(result.headers['content-type']).toContain('application/json');
    expect(result.headers['cache-control']).toBe('no-store');
  });

  test('returns custom status code', () => {
    const result = jsonResponse({ error: 'not found' }, 404);
    expect(result.status).toBe(404);
  });

  test('returns 201 with created resource', () => {
    const result = jsonResponse({ id: '123' }, 201);
    expect(result.status).toBe(201);
    expect(JSON.parse(result.body)).toEqual({ id: '123' });
  });

  test('handles null body', () => {
    const result = jsonResponse(null);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toBeNull();
  });

  test('handles array body', () => {
    const result = jsonResponse([1, 2, 3]);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual([1, 2, 3]);
  });

  test('sets correct content-type header', () => {
    const result = jsonResponse({});
    expect(result.headers['content-type']).toMatch(/application\/json/);
    expect(result.headers['content-type']).toMatch(/charset=utf-8/);
  });
});

describe('parseJsonBody', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().optional(),
  });

  test('parses valid JSON matching schema', () => {
    const result = parseJsonBody('{"name":"Alice","age":30}', schema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  test('allows missing optional fields', () => {
    const result = parseJsonBody('{"name":"Bob"}', schema);
    expect(result).toEqual({ name: 'Bob' });
  });

  test('returns empty object for empty body, then throws on missing required fields', () => {
    // parseJsonBody returns {} for empty body, but schema requires name -> Zod throws
    expect(() => parseJsonBody('', schema)).toThrow(ZodError);
  });

  test('whitespace-only body returns empty object, then throws on missing required fields', () => {
    expect(() => parseJsonBody('   \n  ', schema)).toThrow(ZodError);
  });

  test('throws on invalid JSON syntax', () => {
    expect(() => parseJsonBody('not valid json', schema)).toThrow();
  });

  test('throws on JSON matching schema but wrong type', () => {
    expect(() => parseJsonBody('{"name":123}', schema)).toThrow();
  });

  test('throws on missing required field', () => {
    expect(() => parseJsonBody('{"age":25}', schema)).toThrow();
  });

  test('works with nested schemas', () => {
    const nested = z.object({ user: z.object({ id: z.string() }) });
    const result = parseJsonBody('{"user":{"id":"abc"}}', nested);
    expect(result).toEqual({ user: { id: 'abc' } });
  });

  test('throws on extra fields not in schema', () => {
    const strict = z.object({ name: z.string() }).strict();
    expect(() => parseJsonBody('{"name":"Carol","extra":true}', strict)).toThrow();
  });
});
