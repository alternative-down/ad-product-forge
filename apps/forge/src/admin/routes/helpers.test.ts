/**
 * Unit tests for admin/routes/helpers.ts
 *
 * Covers: normalizeOptionalText, normalizeJsonText, parseJsonBody,
 * jsonResponse, summarizeHealthcheckThreadMessage,
 * extractLatestHealthcheckMessagePreview, summarizeActiveItems
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  normalizeOptionalText,
  normalizeJsonText,
  parseJsonBody,
  jsonResponse,
  summarizeHealthcheckThreadMessage,
  extractLatestHealthcheckMessagePreview,
  summarizeActiveItems,
} from './helpers';

// ─── normalizeOptionalText ────────────────────────────────────────────────────

describe('normalizeOptionalText', () => {
  it('returns null for undefined', () => {
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeOptionalText('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeOptionalText('   \n\t')).toBeNull();
  });

  it('returns trimmed string for non-empty input', () => {
    expect(normalizeOptionalText('  hello world  ')).toBe('hello world');
  });

  it('preserves internal whitespace', () => {
    expect(normalizeOptionalText('hello   world')).toBe('hello   world');
  });
});

// ─── normalizeJsonText ────────────────────────────────────────────────────────

describe('normalizeJsonText', () => {
  it('returns null for undefined', () => {
    expect(normalizeJsonText(undefined, 'field', 'object')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeJsonText('', 'field', 'object')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeJsonText('  \n', 'field', 'object')).toBeNull();
  });

  it('returns JSON string for valid object', () => {
    const result = normalizeJsonText('{"key":"value"}', 'field', 'object');
    expect(result).toBe('{"key":"value"}');
  });

  it('returns JSON string for valid array', () => {
    const result = normalizeJsonText('[1,2,3]', 'field', 'array');
    expect(result).toBe('[1,2,3]');
  });

  it('throws when expected object but got array', () => {
    expect(() => normalizeJsonText('[1,2,3]', 'field', 'object')).toThrow('field must be a JSON object');
  });

  it('throws when expected array but got object', () => {
    expect(() => normalizeJsonText('{"key":"value"}', 'field', 'array')).toThrow('field must be a JSON array');
  });

  it('throws for invalid JSON', () => {
    expect(() => normalizeJsonText('not json', 'field', 'object')).toThrow();
  });

  it('strips extra properties from object (JSON.parse roundtrip)', () => {
    const result = normalizeJsonText('{"a":1}', 'field', 'object');
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  it('normalizes JSON with extra whitespace', () => {
    const result = normalizeJsonText('  {"key":"value"}  ', 'field', 'object');
    expect(result).toBe('{"key":"value"}');
  });
});

// ─── parseJsonBody ─────────────────────────────────────────────────────────────

describe('parseJsonBody', () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number().optional(),
  });

  it('parses valid JSON body', () => {
    const result = parseJsonBody('{"name":"Alice","age":30}', testSchema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('parses minimal body matching schema', () => {
    const result = parseJsonBody('{"name":"Bob"}', testSchema);
    expect(result).toEqual({ name: 'Bob' });
  });

  it('throws for empty bodyText (no JSON.parse fallback)', () => {
    // parseJsonBody calls JSON.parse on trimmed body even when empty
    // so '' throws because JSON.parse('') fails
    expect(() => parseJsonBody('', testSchema)).toThrow();
    expect(() => parseJsonBody('   ', testSchema)).toThrow();
  });

  it('throws ZodError for invalid body', () => {
    expect(() => parseJsonBody('{"name":123}', testSchema)).toThrow();
  });

  it('throws for invalid JSON syntax', () => {
    expect(() => parseJsonBody('not json', testSchema)).toThrow();
  });

  it('applies schema defaults for missing optional fields', () => {
    const schemaWithDefault = z.object({
      name: z.string(),
      active: z.boolean().default(true),
    });
    const result = parseJsonBody('{"name":"Carol"}', schemaWithDefault);
    expect(result).toEqual({ name: 'Carol', active: true });
  });
});

// ─── jsonResponse ─────────────────────────────────────────────────────────────

describe('jsonResponse', () => {
  it('returns default status 200', () => {
    const r = jsonResponse({ ok: true });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true });
  });

  it('returns custom status code', () => {
    const r = jsonResponse({ error: 'not found' }, 404);
    expect(r.status).toBe(404);
  });

  it('includes content-type header', () => {
    const r = jsonResponse(null);
    expect(r.headers['content-type']).toContain('application/json');
  });

  it('includes cache-control no-store', () => {
    const r = jsonResponse({});
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('serializes nested objects correctly', () => {
    const r = jsonResponse({ nested: { deep: [1, 2, 3] } });
    const parsed = JSON.parse(r.body);
    expect(parsed.nested.deep).toEqual([1, 2, 3]);
  });

  it('serializes null body', () => {
    const r = jsonResponse(null);
    expect(r.body).toBe('null');
  });

  it('serializes string body (edge case)', () => {
    const r = jsonResponse('hello');
    expect(r.body).toBe('"hello"');
  });
});

// ─── summarizeHealthcheckThreadMessage ────────────────────────────────────────

describe('summarizeHealthcheckThreadMessage', () => {
  it('returns id, role, createdAt, type, preview, hasReasoning, partTypes', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-1',
      role: 'assistant',
      createdAt: 1000,
      type: 'message',
    });
    expect(result).toMatchObject({
      id: 'msg-1',
      role: 'assistant',
      createdAt: 1000,
      type: 'message',
      preview: null,
      hasReasoning: false,
      partTypes: [],
    });
  });

  it('extracts preview and partTypes from content.parts', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-2',
      role: 'user',
      createdAt: 2000,
      type: null,
      content: {
        parts: [
          { type: 'text', text: 'Hello world' },
          { type: 'tool_use', name: 'test' },
        ],
      },
    });
    expect(result.preview).toBe('Hello world');
    expect(result.partTypes).toEqual(['text', 'tool_use']);
  });

  it('sets hasReasoning true when content has reasoning string', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-3',
      role: 'assistant',
      createdAt: 3000,
      type: 'message',
      content: { reasoning: 'thinking...' },
    });
    expect(result.hasReasoning).toBe(true);
  });

  it('sets hasReasoning true when parts include reasoning type', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-4',
      role: 'assistant',
      createdAt: 4000,
      type: 'message',
      content: { parts: [{ type: 'reasoning', text: '...' }] },
    });
    expect(result.hasReasoning).toBe(true);
  });

  it('sets hasReasoning false when no reasoning', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-5',
      role: 'user',
      createdAt: 5000,
      type: 'message',
      content: { parts: [{ type: 'text', text: 'hello' }] },
    });
    expect(result.hasReasoning).toBe(false);
  });

  it('handles undefined content', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-6',
      role: 'assistant',
      createdAt: 6000,
      type: 'message',
      content: undefined,
    });
    expect(result.preview).toBeNull();
    expect(result.hasReasoning).toBe(false);
    expect(result.partTypes).toEqual([]);
  });

  it('limits partTypes to 20 entries', () => {
    const manyParts = Array.from({ length: 30 }, (_, i) => ({ type: 'text', text: `p${i}` }));
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-7',
      role: 'assistant',
      createdAt: 7000,
      type: 'message',
      content: { parts: manyParts },
    });
    expect(result.partTypes).toHaveLength(20);
  });
});

// ─── extractLatestHealthcheckMessagePreview ──────────────────────────────────

describe('extractLatestHealthcheckMessagePreview', () => {
  it('returns null for non-object content', () => {
    expect(extractLatestHealthcheckMessagePreview(null)).toBeNull();
    expect(extractLatestHealthcheckMessagePreview('string')).toBeNull();
    expect(extractLatestHealthcheckMessagePreview(123)).toBeNull();
  });

  it('returns null when content.parts is not an array', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: 'not array' })).toBeNull();
    expect(extractLatestHealthcheckMessagePreview({ parts: null })).toBeNull();
  });

  it('returns null for empty parts array', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [] })).toBeNull();
  });

  it('returns null when no parts have text or reasoning type', () => {
    const content = { parts: [{ type: 'tool_use', text: 'tool' }] };
    expect(extractLatestHealthcheckMessagePreview(content)).toBeNull();
  });

  it('returns text from latest matching part (reverse iteration)', () => {
    const content = {
      parts: [
        { type: 'text', text: 'first' },
        { type: 'tool_use' },
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'latest text' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('latest text');
  });

  it('returns the latest text/reasoning part in reverse order', () => {
    // reverse iteration finds 'reasoning value' last (it comes after 'text value')
    const content = {
      parts: [
        { type: 'text', text: 'text value' },
        { type: 'reasoning', text: 'reasoning value' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('reasoning value');
  });

  it('returns reasoning text when no text parts exist', () => {
    const content = {
      parts: [
        { type: 'reasoning', text: 'thinking process' },
        { type: 'tool_use' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('thinking process');
  });

  it('falls back to content.content string when no parts exist', () => {
    // After checking parts, function falls back to record.content as string
    const content = {
      content: 'plain text content',
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('plain text content');
  });
});

// ─── summarizeActiveItems ─────────────────────────────────────────────────────

describe('summarizeActiveItems', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeActiveItems([])).toEqual([]);
  });

  it('groups items by their constructor.name', () => {
    const items = [
      { customProp: 1 }, // anonymous object → Object
      { customProp: 2 },
      { customProp: 3 },
    ];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'Object', count: 3 });
  });

  it('counts total items per constructor name', () => {
    const items = [
      { a: 1 },
      { b: 2 },
      { c: 3 },
    ];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'Object', count: 3 });
  });

  it('sorts by count descending', () => {
    class Agent {}
    class Schedule {}
    const items = [
      new Schedule(),
      new Schedule(),
      new Agent(),
    ];
    const result = summarizeActiveItems(items);
    // Schedule (count 2) should come before Agent (count 1)
    expect(result[0].name).toBe('Schedule');
    expect(result[0].count).toBe(2);
  });

  it('handles primitives (uses typeof for non-objects)', () => {
    const items: unknown[] = [
      'string', 'string', 42, true, null,
    ];
    const result = summarizeActiveItems(items);
    // string → 'string' (typeof), number → 'number', boolean → 'boolean', null → 'null' (typeof)
    expect(result.map(r => r.name)).toContain('string');
  });
});