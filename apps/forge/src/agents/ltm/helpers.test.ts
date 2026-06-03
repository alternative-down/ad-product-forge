/**
 * Unit tests for ltm/helpers.ts.
 * Pure utilities for LTM recall serialization and XML escaping.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import {
  safeSerializeRecallSteps,
  safeSerializeGraphResult,
  escapeXml,
  buildRecallSystemMessage,
  type LtmSearchResult,
} from './helpers';

// ─── safeSerializeRecallSteps ────────────────────────────────────────────────

describe('safeSerializeRecallSteps', () => {
  it('serializes empty array', () => {
    expect(safeSerializeRecallSteps([])).toBe('[]');
  });

  it('serializes simple steps', () => {
    const steps = [{ role: 'user', text: 'hello' }];
    expect(safeSerializeRecallSteps(steps)).toBe(
      '[\n  {\n    "role": "user",\n    "text": "hello"\n  }\n]',
    );
  });

  it('serializes nested objects', () => {
    const steps = [{ nested: { deep: [1, 2, 3] } }];
    const result = safeSerializeRecallSteps(steps);
    expect(result).toContain('"deep"');
    expect(result).toContain('1,');
  });

  it('returns fallback on circular reference', () => {
    const circular: unknown[] = [{ self: null as unknown }];
    (circular[0] as Record<string, unknown>).self = circular;
    const result = safeSerializeRecallSteps(circular);
    expect(result).toBe('[unserializable steps payload]');
  });
});

// ─── safeSerializeGraphResult ────────────────────────────────────────────────

describe('safeSerializeGraphResult', () => {
  it('serializes simple object', () => {
    const result = safeSerializeGraphResult({ hit: true, score: 0.95 });
    expect(result).toContain('"hit": true');
    expect(result).toContain('0.95');
  });

  it('serializes empty object', () => {
    expect(safeSerializeGraphResult({})).toBe('{}');
  });

  it('returns fallback on circular reference', () => {
    const circular: unknown = { a: null };
    (circular as Record<string, unknown>).a = circular;
    const result = safeSerializeGraphResult(circular);
    expect(result).toBe('[unserializable graph result]');
  });
});

// ─── escapeXml ───────────────────────────────────────────────────────────────

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeXml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than', () => {
    expect(escapeXml('a > b')).toBe('a &gt; b');
  });

  it('escapes double-quote', () => {
    expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes single-quote', () => {
    expect(escapeXml("say 'hi'")).toBe('say &apos;hi&apos;');
  });

  it('escapes multiple special chars', () => {
    expect(escapeXml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('returns unchanged string with no special chars', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  it('returns empty string unchanged', () => {
    expect(escapeXml('')).toBe('');
  });

  it('handles all escapes in one string', () => {
    const input = '&<>"\'';
    const result = escapeXml(input);
    expect(result).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});

// ─── buildRecallSystemMessage ───────────────────────────────────────────────

describe('buildRecallSystemMessage', () => {
  it('returns null when graphHit=false and results is empty', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when graphHit=true but context is empty', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: true,
      graphScore: 0.9,
      graphContext: '   ',
      results: [],
    });
    expect(result).toBeNull();
  });

  it('returns XML with graph item when graphHit=true and context present', () => {
    const result = buildRecallSystemMessage({
      query: 'what happened',
      graphHit: true,
      graphScore: 0.95,
      graphContext: 'user reported bug',
      results: [],
    });
    expect(result).not.toBeNull();
    expect(result).toContain('<memory-recall');
    expect(result).toContain('source="graph"');
    expect(result).toContain('user reported bug');
    expect(result).toContain('score="0.9500"');
    expect(result).toContain('what happened');
    expect(result).toContain('</memory-recall>');
  });

  it('returns XML with workspace items when graphHit=false and results provided', () => {
    const results: LtmSearchResult[] = [
      { id: 'doc-1', content: 'test content', score: 0.88 },
      { id: 'doc-2', content: 'another doc', score: 0.76 },
    ];
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('source="workspace"');
    expect(result).toContain('test content');
    expect(result).toContain('doc-1');
    expect(result).toContain('0.8800');
    expect(result).toContain('another doc');
    expect(result).toContain('doc-2');
  });

  it('uses score 0.0000 when score is missing', () => {
    const results: LtmSearchResult[] = [{ id: 'doc-x', content: 'content' }];
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results,
    });
    expect(result).toContain('score="0.0000"');
  });

  it('escapes XML special chars in graph context', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: true,
      graphScore: 0.5,
      graphContext: 'user < admin & valid',
      results: [],
    });
    expect(result).toContain('user &lt; admin &amp; valid');
  });

  it('escapes XML special chars in workspace content', () => {
    const results: LtmSearchResult[] = [{ id: 'doc-1', content: 'a > b & c < d' }];
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results,
    });
    expect(result).toContain('a &gt; b &amp; c &lt; d');
  });

  it('escapes XML special chars in result id', () => {
    const results: LtmSearchResult[] = [{ id: 'id <tag> & stuff', content: 'content' }];
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results,
    });
    expect(result).toContain('id &lt;tag&gt; &amp; stuff');
  });

  it('escapes XML special chars in query', () => {
    const result = buildRecallSystemMessage({
      query: 'a & b < c',
      graphHit: true,
      graphScore: 0.5,
      graphContext: 'ctx',
      results: [],
    });
    expect(result).toContain('query="a &amp; b &lt; c"');
  });

  it('includes instructions block', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: true,
      graphScore: 0.5,
      graphContext: 'some context',
      results: [],
    });
    expect(result).toContain('<instructions>');
    expect(result).toContain('datetime');
    expect(result).toContain('I remember');
  });
});
