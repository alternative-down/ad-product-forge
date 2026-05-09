/**
 * Unit tests for admin/routes/helpers.ts
 * Pure functions: normalizeOptionalText, normalizeJsonText,
 * summarizeHealthcheckThreadMessage, extractLatestHealthcheckMessagePreview,
 * summarizeActiveItems.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeOptionalText,
  normalizeJsonText,
  summarizeHealthcheckThreadMessage,
  extractLatestHealthcheckMessagePreview,
  summarizeActiveItems,
  fsPathExists,
} from './helpers';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// ─── normalizeOptionalText ────────────────────────────────────────────────────

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
    expect(normalizeOptionalText('  hello  ')).toBe('hello');
  });

  it('preserves internal whitespace', () => {
    expect(normalizeOptionalText('hello world')).toBe('hello world');
  });

  it('returns string for single character', () => {
    expect(normalizeOptionalText('x')).toBe('x');
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
    expect(normalizeJsonText('  ', 'field', 'array')).toBeNull();
  });

  it('returns trimmed JSON string for valid array', () => {
    expect(normalizeJsonText('["a","b"]', 'field', 'array')).toBe('["a","b"]');
  });

  it('returns trimmed JSON string for valid object', () => {
    expect(normalizeJsonText('{"key":"value"}', 'field', 'object')).toBe('{"key":"value"}');
  });

  it('trims and returns whitespace-wrapped JSON', () => {
    expect(normalizeJsonText('  {"x":1}  ', 'field', 'object')).toBe('{"x":1}');
  });

  it('throws for invalid JSON syntax', () => {
    expect(() => normalizeJsonText('{invalid}', 'field', 'object')).toThrow();
  });

  it('throws for wrong shape: array when object expected', () => {
    expect(() => normalizeJsonText('[1,2]', 'field', 'object')).toThrow('field must be a JSON object');
  });

  it('throws for wrong shape: object when array expected', () => {
    expect(() => normalizeJsonText('{"a":1}', 'field', 'array')).toThrow('field must be a JSON array');
  });

  it('throws for null when object expected', () => {
    expect(() => normalizeJsonText('null', 'field', 'object')).toThrow();
  });

  it('throws for string when object expected', () => {
    expect(() => normalizeJsonText('"hello"', 'field', 'object')).toThrow();
  });
});

// ─── summarizeHealthcheckThreadMessage ───────────────────────────────────────

describe('summarizeHealthcheckThreadMessage', () => {
  function makeMessage(overrides: Partial<{
    id: string; role: string; createdAt: number; type: string | null; content: unknown;
  }> = {}) {
    return {
      id: 'msg-1',
      role: 'assistant',
      createdAt: 1_000_000,
      type: null,
      content: undefined,
      ...overrides,
    };
  }

  it('returns object with id, role, createdAt, type, preview, hasReasoning, partTypes', () => {
    const msg = makeMessage({ content: 'hello' });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('role');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('preview');
    expect(result).toHaveProperty('hasReasoning');
    expect(result).toHaveProperty('partTypes');
  });

  it('extracts preview from nested content object', () => {
    const msg = makeMessage({ content: { content: 'nested response' } });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.preview).toBe('nested response');
  });

  it('extracts preview from last text part', () => {
    const msg = makeMessage({
      content: {
        parts: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'last message' },
        ],
      },
    });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.preview).toBe('last message');
  });

  it('hasReasoning is false when no reasoning present', () => {
    const msg = makeMessage({ content: 'normal response' });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.hasReasoning).toBe(false);
  });

  it('hasReasoning is true when reasoning part exists', () => {
    const msg = makeMessage({
      content: {
        parts: [
          { type: 'reasoning', text: 'let me think...' },
        ],
      },
    });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.hasReasoning).toBe(true);
  });

  it('hasReasoning is true when reasoning string in content', () => {
    const msg = makeMessage({
      content: { reasoning: 'thinking step by step' },
    });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.hasReasoning).toBe(true);
  });

  it('partTypes extracts types from parts array', () => {
    const msg = makeMessage({
      content: {
        parts: [
          { type: 'text', text: 'hello' },
          { type: 'reasoning', text: 'thinking' },
        ],
      },
    });
    const result = summarizeHealthcheckThreadMessage(msg);
    expect(result.partTypes).toContain('text');
    expect(result.partTypes).toContain('reasoning');
  });
});

// ─── extractLatestHealthcheckMessagePreview ───────────────────────────────────

describe('extractLatestHealthcheckMessagePreview', () => {
  it('returns null for null', () => {
    expect(extractLatestHealthcheckMessagePreview(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractLatestHealthcheckMessagePreview(undefined)).toBeNull();
  });

  it('returns null for non-object content', () => {
    expect(extractLatestHealthcheckMessagePreview(123 as unknown)).toBeNull();
    expect(extractLatestHealthcheckMessagePreview('string' as unknown)).toBeNull();
  });

  it('returns null for empty parts array', () => {
    expect(extractLatestHealthcheckMessagePreview({ parts: [] })).toBeNull();
  });

  it('returns last text part value', () => {
    const content = {
      parts: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'last message' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('last message');
  });

  it('skips parts without type=text or type=reasoning', () => {
    const content = {
      parts: [
        { type: 'image', url: 'http://img.png' },
        { type: 'text', text: 'has content' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('has content');
  });

  it('skips parts with empty text', () => {
    const content = {
      parts: [
        { type: 'text', text: '' },
        { type: 'text', text: 'visible' },
      ],
    };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('visible');
  });

  it('falls back to string content field', () => {
    const content = { content: 'plain text response' };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('plain text response');
  });

  it('falls back to reasoning field when no text parts', () => {
    const content = { reasoning: 'chain of thought' };
    expect(extractLatestHealthcheckMessagePreview(content)).toBe('chain of thought');
  });

  it('returns null when no matching content found', () => {
    const content = { parts: [] };
    expect(extractLatestHealthcheckMessagePreview(content)).toBeNull();
  });

  it('truncates preview to 280 characters', () => {
    const longText = 'a'.repeat(300);
    const content = { parts: [{ type: 'text', text: longText }] };
    expect(extractLatestHealthcheckMessagePreview(content)!.length).toBe(280);
  });
});

// ─── summarizeActiveItems ─────────────────────────────────────────────────────

describe('summarizeActiveItems', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeActiveItems([])).toEqual([]);
  });

  it('groups by constructor name', () => {
    const items = [{ name: 'agents' }];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'Object', count: 1 });
  });

  it('groups by constructor name, counts correctly', () => {
    const items = [{ name: 'agents' }, { name: 'agents' }, { name: 'schedules' }];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'Object', count: 3 });
  });

  it('sums all objects into single constructor count', () => {
    const items = [
      { name: 'agents' }, { name: 'agents' }, { name: 'agents' },
      { name: 'schedules' }, { name: 'schedules' },
    ];
    const result = summarizeActiveItems(items);
    expect(result).toContainEqual({ name: 'Object', count: 5 });
  });

  it('returns empty array when given empty input', () => {
    expect(summarizeActiveItems([])).toEqual([]);
  });

  it('groups by constructor name for multiple different types', () => {
    const items = [{ a: 1 }, { b: 2 }, { c: 3 }];
    const result = summarizeActiveItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Object');
    expect(result[0].count).toBe(3);
  });
});

// ─── fsPathExists ─────────────────────────────────────────────────────────────

describe('fsPathExists', () => {
  it('returns true for existing path', async () => {
    const result = await fsPathExists('/tmp');
    expect(result).toBe(true);
  });

  it('returns false for non-existent path', async () => {
    const result = await fsPathExists('/tmp/this-path-does-not-exist-kaelen-12345');
    expect(result).toBe(false);
  });

  it('returns false for path without read permission', async () => {
    const result = await fsPathExists('/root/secret-file-kaelen-99999');
    expect(result).toBe(false);
  });
});
