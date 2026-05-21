/**
 * Unit tests for admin/routes/index.ts — jsonResponse and parseJsonBody.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jsonResponse, parseJsonBody } from './index';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// ─── jsonResponse ─────────────────────────────────────────────────────────────

describe('jsonResponse', () => {
  it('returns 200 status by default', () => {
    const result = jsonResponse({ ok: true });
    expect(result.status).toBe(200);
  });

  it('returns custom status when provided', () => {
    const result = jsonResponse({ error: 'not found' }, 404);
    expect(result.status).toBe(404);
  });

  it('sets content-type to JSON', () => {
    const result = jsonResponse({});
    expect(result.headers['content-type']).toContain('application/json');
  });

  it('sets cache-control to no-store', () => {
    const result = jsonResponse({});
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('stringifies object body', () => {
    const result = jsonResponse({ name: 'Alice', age: 30 });
    expect(JSON.parse(result.body)).toEqual({ name: 'Alice', age: 30 });
  });

  it('stringifies array body', () => {
    const result = jsonResponse([1, 2, 3]);
    expect(JSON.parse(result.body)).toEqual([1, 2, 3]);
  });

  it('stringifies string body', () => {
    const result = jsonResponse('plain text');
    expect(JSON.parse(result.body)).toBe('plain text');
  });

  it('stringifies null body', () => {
    const result = jsonResponse(null);
    expect(JSON.parse(result.body)).toBeNull();
  });

  it('stringifies nested object body', () => {
    const result = jsonResponse({ nested: { key: 'value' } });
    expect(JSON.parse(result.body)).toEqual({ nested: { key: 'value' } });
  });

  it('stringifies empty object body', () => {
    const result = jsonResponse({});
    expect(JSON.parse(result.body)).toEqual({});
  });

  it('preserves number values in body', () => {
    const result = jsonResponse({ count: 42, price: 3.14 });
    expect(JSON.parse(result.body)).toEqual({ count: 42, price: 3.14 });
  });

  it('preserves boolean values in body', () => {
    const result = jsonResponse({ active: true, deleted: false });
    expect(JSON.parse(result.body)).toEqual({ active: true, deleted: false });
  });
});

// ─── parseJsonBody ────────────────────────────────────────────────────────────

describe('parseJsonBody', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it('parses valid JSON object against schema', () => {
    const result = parseJsonBody('{"name":"Alice","age":30}', schema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns empty object for empty body text', () => {
    const result = parseJsonBody('', z.object({}));
    expect(result).toEqual({});
  });

  it('returns empty object for whitespace-only body text', () => {
    const result = parseJsonBody('   ', z.object({}));
    expect(result).toEqual({});
  });

  it('throws for invalid JSON syntax', () => {
    expect(() => parseJsonBody('{invalid}', schema)).toThrow();
  });

  it('throws for schema mismatch (type error)', () => {
    expect(() => parseJsonBody('{"name":123}', schema)).toThrow();
  });

  it('parses array when schema allows array', () => {
    const arraySchema = z.array(z.number());
    const result = parseJsonBody('[1,2,3]', arraySchema);
    expect(result).toEqual([1, 2, 3]);
  });

  it('throws for partial JSON (trailing comma)', () => {
    expect(() => parseJsonBody('{"name":"Bob",}', schema)).toThrow();
  });

  it('preserves string values with spaces', () => {
    const result = parseJsonBody('{"name":"Bob Smith","age":25}', schema);
    expect(result.name).toBe('Bob Smith');
  });

  it('preserves null values in JSON', () => {
    const schemaWithNull = z.object({ name: z.string().nullable() });
    const result = parseJsonBody('{"name":null}', schemaWithNull);
    expect(result.name).toBeNull();
  });

  it('throws for number when string expected', () => {
    expect(() => parseJsonBody('{"name":999,"age":30}', schema)).toThrow();
  });
});
