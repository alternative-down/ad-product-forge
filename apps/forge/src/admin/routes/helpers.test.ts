import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

// Mock node:fs/promises for fsPathExists tests
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

import { access } from 'node:fs/promises';

describe('normalizeOptionalText', () => {
  it('returns null for undefined', () => {
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeOptionalText('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeOptionalText('   \t\n  ')).toBeNull();
  });

  it('returns trimmed string for non-empty input', () => {
    expect(normalizeOptionalText('  hello world  ')).toBe('hello world');
  });

  it('preserves internal whitespace and newlines', () => {
    expect(normalizeOptionalText('a')).toBe('a');
    expect(normalizeOptionalText('hello\tworld')).toBe('hello\tworld');
    expect(normalizeOptionalText('multi\nline')).toBe('multi\nline');
  });
});

describe('normalizeJsonText', () => {
  it('returns null for undefined', () => {
    expect(normalizeJsonText(undefined, 'field', 'object')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeJsonText('', 'field', 'object')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeJsonText('   \n', 'field', 'object')).toBeNull();
  });

  it('returns canonical JSON for valid object', () => {
    // JSON.stringify preserves key order — input must match expected output
    expect(normalizeJsonText('{"a":1,"b":2}', 'field', 'object')).toBe('{"a":1,"b":2}');
  });

  it('returns canonical JSON for valid array', () => {
    expect(normalizeJsonText('[1,2,3]', 'field', 'array')).toBe('[1,2,3]');
  });

  it('normalizes whitespace in valid JSON', () => {
    expect(normalizeJsonText('{ "a" : 1 }', 'field', 'object')).toBe('{"a":1}');
  });

  it('throws for string when object expected', () => {
    expect(() => normalizeJsonText('"string"', 'field', 'object')).toThrow(
      'field must be a JSON object',
    );
  });

  it('throws for array when object expected', () => {
    expect(() => normalizeJsonText('[1,2,3]', 'field', 'object')).toThrow(
      'field must be a JSON object',
    );
  });

  it('throws for number when object expected', () => {
    expect(() => normalizeJsonText('42', 'field', 'object')).toThrow(
      'field must be a JSON object',
    );
  });

  it('throws for object when array expected', () => {
    expect(() => normalizeJsonText('{"a":1}', 'field', 'array')).toThrow(
      'field must be a JSON array',
    );
  });

  it('throws for null when array expected', () => {
    expect(() => normalizeJsonText('null', 'field', 'array')).toThrow(
      'field must be a JSON array',
    );
  });

  it('throws for invalid JSON syntax', () => {
    expect(() => normalizeJsonText('{invalid}', 'field', 'object')).toThrow();
  });

  it('uses fieldName in error message', () => {
    expect(() => normalizeJsonText('[1]', 'myField', 'object')).toThrow(
      'myField must be a JSON object',
    );
  });
});

describe('parseJsonBody', () => {
  const schema = z.object({ name: z.string(), value: z.number() });

  it('parses valid JSON matching schema', () => {
    const result = parseJsonBody('{"name":"test","value":42}', schema);
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  it('returns empty object for empty string', () => {
    const emptySchema = z.object({});
    expect(parseJsonBody('', emptySchema)).toEqual({});
  });

  it('returns empty object for whitespace-only string', () => {
    const emptySchema = z.object({});
    expect(parseJsonBody('   \n\t', emptySchema)).toEqual({});
  });

  it('throws for invalid JSON syntax', () => {
    expect(() => parseJsonBody('not json', schema)).toThrow();
  });

  it('throws for JSON not matching schema', () => {
    expect(() => parseJsonBody('{"name":"test"}', schema)).toThrow();
  });
});

describe('jsonResponse', () => {
  it('uses default status 200', () => {
    const result = jsonResponse({ ok: true });
    expect(result.status).toBe(200);
  });

  it('uses custom status when provided', () => {
    const result = jsonResponse({ error: 'bad' }, 400);
    expect(result.status).toBe(400);
  });

  it('sets content-type header to application/json with charset', () => {
    const result = jsonResponse({});
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('sets cache-control to no-store', () => {
    const result = jsonResponse({});
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('serializes body to JSON string', () => {
    const result = jsonResponse({ count: 5, nested: { a: 1 } });
    expect(result.body).toBe('{"count":5,"nested":{"a":1}}');
  });

  it('serializes string body as JSON string', () => {
    const result = jsonResponse('plain text');
    expect(result.body).toBe('"plain text"');
  });

  it('serializes null body as "null"', () => {
    const result = jsonResponse(null);
    expect(result.body).toBe('null');
  });
});

describe('summarizeHealthcheckThreadMessage', () => {
  it('returns null preview and empty partTypes for empty content', () => {
    const msg = { id: '1', role: 'user', createdAt: 1000, type: null };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.preview).toBeNull();
    expect(result.hasReasoning).toBe(false);
    expect(result.partTypes).toEqual([]);
  });

  it('returns null preview for top-level string content', () => {
    // String content is not an object, so it does NOT enter the content.content branch.
    // extractLatestHealthcheckMessagePreview returns null for non-object content.
    const msg = {
      id: '1',
      role: 'assistant',
      createdAt: 2000,
      type: 'text',
      content: 'Hello, this is a test message.',
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.preview).toBeNull();
    expect(result.hasReasoning).toBe(false);
    expect(result.partTypes).toEqual([]);
  });

  it('extracts preview from last text part in parts array', () => {
    const msg = {
      id: '2',
      role: 'assistant',
      createdAt: 3000,
      type: null,
      content: {
        parts: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.preview).toBe('Second part');
  });

  it('prefers text part over reasoning when reasoning comes after', () => {
    const msg = {
      id: '3',
      role: 'assistant',
      createdAt: 4000,
      type: null,
      content: {
        parts: [
          { type: 'reasoning', text: 'thinking...' },
          { type: 'text', text: 'final answer' },
        ],
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.preview).toBe('final answer');
  });

  it('detects hasReasoning from top-level content.reasoning string', () => {
    const msg = {
      id: '4',
      role: 'assistant',
      createdAt: 5000,
      type: null,
      content: {
        reasoning: 'This is some reasoning about the answer.',
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.hasReasoning).toBe(true);
  });

  it('does not flag hasReasoning for empty reasoning string', () => {
    const msg = {
      id: '4b',
      role: 'assistant',
      createdAt: 5100,
      type: null,
      content: {
        reasoning: '   \n',
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.hasReasoning).toBe(false);
  });

  it('detects hasReasoning from reasoning part type', () => {
    const msg = {
      id: '5',
      role: 'assistant',
      createdAt: 6000,
      type: null,
      content: {
        parts: [{ type: 'reasoning', text: 'thinking' }],
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.hasReasoning).toBe(true);
  });

  it('reports partTypes extracted from parts', () => {
    const msg = {
      id: '6',
      role: 'assistant',
      createdAt: 7000,
      type: null,
      content: {
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'tool-call', text: 'call' },
          { type: 'reasoning', text: 'think' },
        ],
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.partTypes).toEqual(['text', 'tool-call', 'reasoning']);
  });

  it('limits partTypes to 20 entries', () => {
    const manyParts = Array.from({ length: 30 }, (_, i) => ({
      type: 'text',
      text: `part ${i}`,
    }));
    const msg = {
      id: '7',
      role: 'assistant',
      createdAt: 8000,
      type: null,
      content: { parts: manyParts },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.partTypes).toHaveLength(20);
  });

  it('ignores parts that are not objects or lack type field', () => {
    const msg = {
      id: '8',
      role: 'assistant',
      createdAt: 9000,
      type: null,
      content: {
        parts: [null, 'string', 42, { notype: true }, { type: 'text', text: 'valid' }],
      },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.partTypes).toEqual(['text']);
    expect(result.preview).toBe('valid');
  });

  it('passes through id, role, createdAt, type unchanged', () => {
    const msg = {
      id: 'msg-123',
      role: 'user',
      createdAt: 9999,
      type: 'input',
      content: { parts: [] },
    };
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.id).toBe('msg-123');
    expect(result.role).toBe('user');
    expect(result.createdAt).toBe(9999);
    expect(result.type).toBe('input');
  });
});

describe('extractLatestHealthcheckMessagePreview', () => {
  it('returns null for null', () => {
    expect(extractLatestHealthcheckMessagePreview(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractLatestHealthcheckMessagePreview(undefined)).toBeNull();
  });

  it('returns null for non-object (string)', () => {
    expect(extractLatestHealthcheckMessagePreview('just a string')).toBeNull();
  });

  it('returns null for non-object (number)', () => {
    expect(extractLatestHealthcheckMessagePreview(42)).toBeNull();
  });

  it('returns null for non-object (boolean)', () => {
    expect(extractLatestHealthcheckMessagePreview(true)).toBeNull();
  });

  it('returns null for empty parts array', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [] })).toBeNull();
  });

  it('returns null for parts with non-object items', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [null, 'string', 42] })).toBeNull();
  });

  it('returns null for parts missing type property', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [{ text: 'hi' }] })).toBeNull();
  });

  it('returns null for parts missing text property', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [{ type: 'text' }] })).toBeNull();
  });

  it('skips non-text/reasoning part types', () => {
    const content = {
      parts: [
        { type: 'tool-call', text: 'should skip' },
        { type: 'image', text: 'also skip' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBeNull();
  });

  it('skips text part with empty string content', () => {
    const content = {
      parts: [
        { type: 'text', text: '' },
        { type: 'text', text: '  \n' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBeNull();
  });

  it('returns last text part trimmed and sliced to 280 chars', () => {
    const longText = 'a'.repeat(300);
    const content = {
      parts: [
        { type: 'text', text: 'first' },
        { type: 'text', text: longText },
      ],
    };
    const result = extractLatestHealthcheckMessagePreview(content);
    expect(result).toHaveLength(280);
    // .slice(0, 280) cuts off at 280 chars — no ellipsis added
    expect(result?.endsWith('aaaaa')).toBe(true);
  });

  it('returns reasoning part when no text part exists', () => {
    const content = {
      parts: [{ type: 'reasoning', text: '  reasoning text  ' }],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('reasoning text');
  });

  it('prefers last text part over earlier reasoning part', () => {
    const content = {
      parts: [
        { type: 'reasoning', text: 'should not show' },
        { type: 'text', text: 'final text' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('final text');
  });

  it('falls back to top-level content string when no parts', () => {
    expect(extractLatestHealthcheckMessagePreview({ content: '  top level  ' })).toBe('top level');
  });

  it('top-level content takes priority over reasoning', () => {
    const content = { content: 'content text', reasoning: 'reasoning text' };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('content text');
  });

  it('falls back to top-level reasoning when no content string and no parts', () => {
    expect(extractLatestHealthcheckMessagePreview({ reasoning: '  reason here  ' })).toBe('reason here');
  });

  it('returns null when top-level content is empty string', () => {
    expect(extractLatestHealthcheckMessagePreview({ content: '' })).toBeNull();
  });

  it('returns null when top-level reasoning is whitespace-only', () => {
    expect(extractLatestHealthcheckMessagePreview({ reasoning: '   \n' })).toBeNull();
  });

  it('trims and slices long top-level content to 280 chars', () => {
    const long = 'a'.repeat(300);
    const result = extractLatestHealthcheckMessagePreview({ content: '  ' + long });
    expect(result).toHaveLength(280);
    // .slice(0, 280) cuts off at 280 chars — no ellipsis added
    expect(result?.endsWith('aaaaa')).toBe(true);
  });

  it('prioritizes parts array over top-level content', () => {
    const content = {
      parts: [{ type: 'text', text: 'from parts' }],
      content: 'from top level',
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('from parts');
  });

  it('skips text parts where text is not a string', () => {
    const content = {
      parts: [
        { type: 'text', text: { not: 'a string' } },
        { type: 'reasoning', text: 'actual reasoning' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('actual reasoning');
  });
});

describe('summarizeActiveItems', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeActiveItems([])).toEqual([]);
  });

  it('counts and groups instances by constructor name', () => {
    class Dog {}
    class Cat {}
    const items = [new Dog(), new Cat(), new Dog(), new Cat(), new Cat()];
    const result = summarizeActiveItems(items);
    expect(result).toEqual([
      { name: 'Cat', count: 3 },
      { name: 'Dog', count: 2 },
    ]);
  });

  it('sorts by count descending', () => {
    class A {}
    class B {}
    class C {}
    const items = [new C(), new A(), new B(), new B(), new C(), new C(), new C()];
    const result = summarizeActiveItems(items);
    expect(result[0]).toEqual({ name: 'C', count: 4 });
    expect(result[1]).toEqual({ name: 'B', count: 2 });
    expect(result[2]).toEqual({ name: 'A', count: 1 });
  });

  it('uses "unknown" for null-prototype objects', () => {
    const item = Object.create(null);
    const result = summarizeActiveItems([item]);
    // Object.create(null) has no constructor, so constructor?.name is undefined -> 'unknown'
    expect(result).toEqual([{ name: 'object', count: 1 }]);
  });

  it('uses typeof for plain primitives (no constructor)', () => {
    // Plain primitives (1, 'a', true) have typeof = 'number'/'string'/'boolean', not 'object'
    const items = [1, 'a', true, 2, 'b'];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'number', count: 2 });
    expect(result).toContainEqual({ name: 'string', count: 2 });
    expect(result).toContainEqual({ name: 'boolean', count: 1 });
  });

  it('groups plain objects under "Object"', () => {
    const items = [{}, { a: 1 }, {}];
    const result = summarizeActiveItems(items);
    expect(result).toEqual([{ name: 'Object', count: 3 }]);
  });
});

describe('fsPathExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when access resolves (path exists)', async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    const result = await fsPathExists('/some/existing/path');
    expect(result).toBe(true);
    expect(access).toHaveBeenCalledOnce();
    expect(access).toHaveBeenCalledWith('/some/existing/path');
  });

  it('returns false when access rejects (path does not exist)', async () => {
    const error = new Error('ENOENT: no such file or directory');
    vi.mocked(access).mockRejectedValue(error);
    const result = await fsPathExists('/nonexistent/path');
    expect(result).toBe(false);
    expect(access).toHaveBeenCalledOnce();
    expect(access).toHaveBeenCalledWith('/nonexistent/path');
  });
});
