/**
 * Unit tests for admin/routes/helpers.ts.
 * Pure helper functions for the admin API layer.
 * Coverage gap: 0 existing tests for 8 exported functions.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  normalizeOptionalText,
  normalizeJsonText,
  parseJsonBody,
  jsonResponse,
  summarizeHealthcheckThreadMessage,
  extractLatestHealthcheckMessagePreview,
  summarizeActiveItems,
  fsPathExists,
} from './helpers';

const mockSchema = z.object({
  name: z.string(),
  age: z.number().optional(),
});

describe('normalizeOptionalText', () => {
  it('returns null for empty string', () => {
    expect(normalizeOptionalText('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeOptionalText('   ')).toBeNull();
  });

  it('trims and returns the string', () => {
    expect(normalizeOptionalText('  hello world  ')).toBe('hello world');
  });

  it('returns null when input is undefined', () => {
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it('returns null when input is empty after trim', () => {
    expect(normalizeOptionalText('\t\n')).toBeNull();
  });
});

describe('normalizeJsonText', () => {
  it('returns null for empty string', () => {
    expect(normalizeJsonText('', 'object')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeJsonText('  ', 'array')).toBeNull();
  });

  it('returns JSON string for valid object', () => {
    const result = normalizeJsonText('{"key":"value"}', 'object');
    expect(result).toBe('{"key":"value"}');
  });

  it('returns JSON string for valid array', () => {
    const result = normalizeJsonText('[1,2,3]', 'items', 'array');
    expect(result).toBe('[1,2,3]');
  });

  it('throws when array expected but object received', () => {
    expect(() => normalizeJsonText('{"a":1}', 'items', 'array')).toThrow('items must be a JSON array');
  });

  it('throws when object expected but array received', () => {
    expect(() => normalizeJsonText('[1,2]', 'items', 'object')).toThrow('items must be a JSON object');
  });

  it('throws when primitive received', () => {
    expect(() => normalizeJsonText('"string"', 'items', 'object')).toThrow('items must be a JSON object');
  });
});

describe('parseJsonBody', () => {
  it('parses valid JSON against schema', () => {
    const result = parseJsonBody('{"name":"Alice","age":30}', mockSchema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('parses JSON with optional field missing', () => {
    const result = parseJsonBody('{"name":"Bob"}', mockSchema);
    expect(result).toEqual({ name: 'Bob' });
  });

  it('returns empty object for empty body (schema must accept {})', () => {
    // parseJsonBody('') → parsed = {} → z.object({}).parse({}) succeeds
    const result = parseJsonBody('', z.object({}));
    expect(result).toEqual({});
  });

  it('returns empty object for whitespace body (schema must accept {})', () => {
    const result = parseJsonBody('   ', z.object({}));
    expect(result).toEqual({});
  });

  it('throws for invalid JSON', () => {
    expect(() => parseJsonBody('not json', mockSchema)).toThrow();
  });

  it('throws for missing required field', () => {
    expect(() => parseJsonBody('{"age":25}', mockSchema)).toThrow();
  });

  it('throws for wrong type', () => {
    expect(() => parseJsonBody('{"name":123}', mockSchema)).toThrow();
  });
});

describe('jsonResponse', () => {
  it('returns 200 with JSON body by default', () => {
    const result = jsonResponse({ ok: true });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('application/json');
    expect(result.body).toBe('{"ok":true}');
  });

  it('returns custom status', () => {
    const result = jsonResponse({ id: 1 }, 201);
    expect(result.status).toBe((201));
  });

  it('returns correct headers for 500', () => {
    const result = jsonResponse({ error: 'fail' }, 500);
    expect(result.status).toBe(500);
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('handles string body', () => {
    const result = jsonResponse('plain text');
    expect(result.body).toBe('"plain text"');
  });
});

describe('summarizeHealthcheckThreadMessage', () => {
  it('returns basic fields for simple message', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-1', role: 'user', createdAt: 1000, type: 'text', content: null,
    });
    expect(result).toEqual({
      id: 'msg-1', role: 'user', createdAt: 1000, type: 'text', preview: null, hasReasoning: false, partTypes: [],
    });
  });

  it('extracts preview from text part', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-2', role: 'assistant', createdAt: 2000, type: 'text',
      content: { parts: [{ type: 'text', text: 'Hello world this is a test' }] },
    });
    expect(result.preview).toBe('Hello world this is a test');
    expect(result.partTypes).toEqual(['text']);
  });

  it('extracts preview from reasoning part', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-3', role: 'assistant', createdAt: 3000, type: 'text',
      content: { parts: [{ type: 'reasoning', text: 'Thinking...' }] },
    });
    expect(result.preview).toBe('Thinking...');
    expect(result.hasReasoning).toBe(true);
  });

  it('extracts preview from direct content string (fallback)', () => {
    // extractLatestHealthcheckMessagePreview uses content string as fallback
    // but summarizeHealthcheckThreadMessage calls it with the content
    // Direct string content would not have 'parts' so it falls through
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-4', role: 'user', createdAt: 4000, type: null,
      content: { content: 'direct content string' } as { parts?: unknown[]; content: string },
    });
    expect(result.preview).toBe('direct content string');
  });

  it('extracts preview from reasoning string field', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-5', role: 'assistant', createdAt: 5000, type: null,
      content: { reasoning: 'deep thought process' },
    });
    expect(result.preview).toBe('deep thought process');
    expect(result.hasReasoning).toBe(true);
  });

  it('sets hasReasoning true when reasoning part exists', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-6', role: 'assistant', createdAt: 6000, type: null,
      content: { parts: [{ type: 'reasoning', text: 'thinking' }, { type: 'text', text: 'answer' }] },
    });
    expect(result.hasReasoning).toBe(true);
    expect(result.partTypes).toEqual(['reasoning', 'text']);
    expect(result.preview).toBe('answer'); // last text part wins
  });

  it('returns null preview for null content', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-7', role: 'user', createdAt: 7000, type: 'text', content: null,
    });
    expect(result.preview).toBeNull();
  });

  it('limits partTypes to 20', () => {
    const manyParts = Array.from({ length: 30 }, (_, i) => ({ type: 'text', text: `part ${i}` }));
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-8', role: 'assistant', createdAt: 8000, type: null, content: { parts: manyParts },
    });
    expect(result.partTypes).toHaveLength(20);
  });

  it('truncates preview to 280 characters', () => {
    const long = 'a'.repeat(400);
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-9', role: 'assistant', createdAt: 9000, type: null,
      content: { parts: [{ type: 'text', text: long }] },
    });
    expect(result.preview).toHaveLength(280);
  });

  it('handles mixed parts, last text wins', () => {
    const result = summarizeHealthcheckThreadMessage({
      id: 'msg-10', role: 'assistant', createdAt: 10000, type: null,
      content: { parts: [
        { type: 'text', text: 'first' },
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'final answer' },
      ] },
    });
    expect(result.preview).toBe('final answer');
    expect(result.hasReasoning).toBe(true);
  });
});

describe('extractLatestHealthcheckMessagePreview', () => {
  it('returns null for null content', () => {
    expect(extractLatestHealthcheckMessagePreview(null)).toBeNull();
  });

  it('returns null for primitive', () => {
    expect(extractLatestHealthcheckMessagePreview('string' as unknown as object)).toBeNull();
  });

  it('returns null for empty parts array', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [] })).toBeNull();
  });

  it('extracts from last text part', () => {
    const result = extractLatestHealthcheckMessagePreview({
      parts: [{ type: 'text', text: 'early' }, { type: 'text', text: 'latest' }],
    });
    expect(result).toBe('latest');
  });

  it('skips empty text parts', () => {
    const result = extractLatestHealthcheckMessagePreview({
      parts: [{ type: 'text', text: '' }, { type: 'text', text: 'valid' }],
    });
    expect(result).toBe('valid');
  });

  it('skips whitespace-only text', () => {
    const result = extractLatestHealthcheckMessagePreview({
      parts: [{ type: 'text', text: '   \n\t  ' }, { type: 'text', text: 'found' }],
    });
    expect(result).toBe('found');
  });

  it('returns null for non-text/non-reasoning parts', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [{ type: 'image', url: 'x' }] })).toBeNull();
  });

  it('falls back to direct content string', () => {
    const result = extractLatestHealthcheckMessagePreview({ content: 'fallback text' });
    expect(result).toBe('fallback text');
  });

  it('falls back to reasoning string', () => {
    const result = extractLatestHealthcheckMessagePreview({ reasoning: 'thinking text' });
    expect(result).toBe('thinking text');
  });

  it('prioritizes text part over direct content', () => {
    const result = extractLatestHealthcheckMessagePreview({
      parts: [{ type: 'text', text: 'from parts' }],
      content: 'from content',
    });
    expect(result).toBe('from parts');
  });

  it('truncates to 280 characters', () => {
    const result = extractLatestHealthcheckMessagePreview({
      parts: [{ type: 'text', text: 'x'.repeat(500) }],
    });
    expect(result).toHaveLength(280);
  });
});

describe('summarizeActiveItems', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeActiveItems([])).toEqual([]);
  });

  it('counts object types by constructor name', () => {
    class Agent {}
    class Schedule {}
    const items = [new Agent(), new Agent(), new Schedule()];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'Agent', count: 2 });
    expect(result).toContainEqual({ name: 'Schedule', count: 1 });
  });

  it('sorts by count descending', () => {
    class A {}
    class B {}
    class C {}
    const items = [new A(), new B(), new B(), new B(), new C()];
    const result = summarizeActiveItems(items);
    expect(result[0]).toEqual({ name: 'B', count: 3 });
    expect(result[1]).toEqual({ name: 'A', count: 1 });
  });

  it('uses typeof for primitives', () => {
    const items = ['a', 'b', 'c'];
    const result = summarizeActiveItems(items);
    expect(result).toEqual([{ name: 'string', count: 3 }]);
  });

  it('handles null objects', () => {
    const items: unknown[] = [null, null];
    const result = summarizeActiveItems(items);
    expect(result).toEqual([{ name: 'object', count: 2 }]);
  });

  it('handles unknown constructor', () => {
    // Empty object has no meaningful constructor.name
    const items = [Object.create(null)];
    const result = summarizeActiveItems(items);
    // Should fall back to typeof
    expect(result).toHaveLength(1);
  });

  it('handles constructor with undefined name', () => {
    const items = [{ constructor: { name: undefined } }];
    const result = summarizeActiveItems(items);
    expect(result[0].name).toBe('unknown');
  });
});

// Must be at top level — vi.mock is hoisted
const enoentError = new Error('ENOENT');
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

describe('fsPathExists', () => {
  it('returns true for existing path', async () => {
    const { access } = await import('node:fs/promises') as { access: ReturnType<typeof vi.fn> };
    vi.mocked(access).mockResolvedValue(undefined);
    const { fsPathExists } = await import('./helpers');
    const result = await fsPathExists('/some/path');
    expect(result).toBe(true);
  });

  it('returns false when access throws', async () => {
    const { access } = await import('node:fs/promises') as { access: ReturnType<typeof vi.fn> };
    vi.mocked(access).mockRejectedValue(enoentError);
    const { fsPathExists } = await import('./helpers');
    const result = await fsPathExists('/nonexistent/path');
    expect(result).toBe(false);
  });
});