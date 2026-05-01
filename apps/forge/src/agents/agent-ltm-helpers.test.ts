import { describe, expect, test, vi, afterEach } from 'vitest';
import { safeSerializeRecallSteps, safeSerializeGraphResult, escapeXml, buildRecallSystemMessage } from './agent-ltm-helpers.js';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { forgeDebug } from '@forge-runtime/core';

describe('safeSerializeRecallSteps', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  test('serializes plain array of objects', () => {
    const steps = [{ id: 1, text: 'hello' }, { id: 2, text: 'world' }];
    expect(safeSerializeRecallSteps(steps)).toBe(
      '[\n  {\n    "id": 1,\n    "text": "hello"\n  },\n  {\n    "id": 2,\n    "text": "world"\n  }\n]',
    );
  });

  test('serializes mixed types including strings and numbers', () => {
    const steps = ['text', 42, true, null];
    expect(safeSerializeRecallSteps(steps)).toBe(
      '[\n  "text",\n  42,\n  true,\n  null\n]',
    );
  });

  test('returns fallback message on circular reference', () => {
    const circular: unknown[] = [{ label: 'a' }];
    (circular[0] as Record<string, unknown>).self = circular;
    const result = safeSerializeRecallSteps(circular);
    expect(result).toBe('[unserializable steps payload]');
    expect(forgeDebug).toHaveBeenCalled();
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'agent-long-term-memory-recall', level: 'warn' }),
    );
  });

  test('returns fallback message when stringify throws', () => {
    const bad = { toJSON: () => { throw new Error('boom'); } };
    const result = safeSerializeRecallSteps([bad]);
    expect(result).toBe('[unserializable steps payload]');
    expect(forgeDebug).toHaveBeenCalled();
  });

  test('serializes empty array', () => {
    expect(safeSerializeRecallSteps([])).toBe('[]');
  });

  test('serializes deeply nested structure', () => {
    const steps = [{ a: { b: { c: [{ d: 1 }] } } }];
    expect(safeSerializeRecallSteps(steps)).toContain('"d": 1');
  });
});

describe('safeSerializeGraphResult', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  test('serializes a plain result object', () => {
    const result = { hit: true, score: 0.95, context: 'found it', sourcesCount: 2 };
    expect(safeSerializeGraphResult(result)).toContain('"hit": true');
    expect(safeSerializeGraphResult(result)).toContain('"score": 0.95');
  });

  test('serializes null gracefully', () => {
    expect(safeSerializeGraphResult(null)).toBe('null');
  });

  test('serializes array of results', () => {
    const results = [{ id: '1' }, { id: '2' }];
    expect(safeSerializeGraphResult(results)).toContain('"id": "1"');
  });

  test('returns fallback when circular reference detected', () => {
    const circular: Record<string, unknown> = { label: 'loop' };
    circular.self = circular;
    const result = safeSerializeGraphResult(circular);
    expect(result).toBe('[unserializable graph result]');
    expect(forgeDebug).toHaveBeenCalled();
  });

  test('returns fallback when toJSON throws', () => {
    const bad = { toJSON: () => { throw new Error('serialize error'); } };
    const result = safeSerializeGraphResult(bad);
    expect(result).toBe('[unserializable graph result]');
  });
});

describe('escapeXml', () => {
  test('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  test('escapes less-than', () => {
    expect(escapeXml('<div>')).toBe('&lt;div&gt;');
  });

  test('escapes greater-than', () => {
    expect(escapeXml('a > b')).toBe('a &gt; b');
  });

  test('escapes double-quote', () => {
    expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  test('escapes single-quote', () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  test('escapes all special chars in one call', () => {
    expect(escapeXml('A & B < C > D "E" \'F\'')).toBe(
      'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;',
    );
  });

  test('returns input unchanged when no special chars present', () => {
    expect(escapeXml('plain text 123')).toBe('plain text 123');
  });

  test('escapes empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  test('escapes unicode content', () => {
    expect(escapeXml('日本語 & émojis 🎉')).toBe('日本語 &amp; émojis 🎉');
  });
});

describe('buildRecallSystemMessage', () => {
  const defaultInput = {
    query: 'test query',
    graphHit: false,
    graphScore: null,
    graphContext: '',
    results: [] as { id: string; content: string; score?: number }[],
  };

  test('returns null when graph hit is false and results array is empty', () => {
    expect(buildRecallSystemMessage(defaultInput)).toBeNull();
  });

  test('returns null when graph hit is true but graphContext is empty', () => {
    expect(buildRecallSystemMessage({ ...defaultInput, graphHit: true, graphScore: 0.9 })).toBeNull();
  });

  test('returns null when graph hit is true but graphContext is whitespace only', () => {
    expect(buildRecallSystemMessage({ ...defaultInput, graphHit: true, graphScore: 0.8, graphContext: '   \n  ' })).toBeNull();
  });

  test('returns system message with graph item when graph hit and non-empty context', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      graphHit: true,
      graphScore: 0.85,
      graphContext: 'Graph retrieved context about the query',
    });
    expect(result).not.toBeNull();
    expect(result).toContain('<memory-recall');
    expect(result).toContain('source="graph"');
    expect(result).toContain('score="0.8500"');
    expect(result).toContain('Graph retrieved context');
    expect(result).toContain('</memory-recall>');
  });

  test('includes on-datetime attribute in opening tag', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      graphHit: true,
      graphScore: 0.5,
      graphContext: 'content',
    });
    expect(result).toMatch(/\bon-datetime="[^"]+"/);
  });

  test('escapes graph context XML chars', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      graphHit: true,
      graphScore: 0.7,
      graphContext: 'Contains <special> & "chars" here',
    });
    expect(result).toContain('&lt;special&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;chars&quot;');
  });

  test('escapes graph query XML chars in attribute', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      graphHit: true,
      graphScore: 0.9,
      graphContext: 'some context',
      query: 'Query with <special> & "chars"',
    });
    expect(result).toContain('&lt;special&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;chars&quot;');
  });

  test('returns system message with workspace items when graph hit is false', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      results: [
        { id: 'doc-1', content: 'First document content', score: 0.95 },
        { id: 'doc-2', content: 'Second document content', score: 0.72 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result).toContain('source="workspace"');
    expect(result).toContain('id="doc-1"');
    expect(result).toContain('score="0.9500"');
    expect(result).toContain('First document content');
    expect(result).toContain('id="doc-2"');
    expect(result).toContain('score="0.7200"');
  });

  test('escapes workspace item content XML chars', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      results: [{ id: 'd1', content: 'Content with <tag> & "quotes"', score: 0.8 }],
    });
    expect(result).toContain('&lt;tag&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;quotes&quot;');
  });

  test('escapes workspace item id XML chars', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      results: [{ id: 'id-with-<special>&chars"', content: 'text', score: 0.5 }],
    });
    expect(result).toContain('id="id-with-&lt;special&gt;&amp;chars&quot;"');
  });

  test('defaults score to 0.0000 when score is undefined', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      results: [{ id: 'd1', content: 'No score' }],
    });
    expect(result).toContain('score="0.0000"');
  });

  test('defaults graphScore to no score attribute when graphScore is null', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      graphHit: true,
      graphScore: null,
      graphContext: 'Graph content without score',
    });
    expect(result).not.toContain('score=');
  });

  test('includes instructions section', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      results: [{ id: 'd1', content: 'test' }],
    });
    expect(result).toContain('<instructions>');
    expect(result).toContain('Now is the datetime');
    expect(result).toContain('long-term memory');
    expect(result).toContain('</instructions>');
  });

  test('handles many workspace results', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      id: `doc-${i}`,
      content: `Document ${i} content`,
      score: 0.9 - i * 0.01,
    }));
    const result = buildRecallSystemMessage({ ...defaultInput, results });
    expect(result).not.toBeNull();
    expect(result?.match(/<item/g)?.length).toBe(20);
  });

  test('on-datetime is ISO format', () => {
    const result = buildRecallSystemMessage({
      ...defaultInput,
      results: [{ id: 'd1', content: 'test' }],
    });
    const match = result?.match(/on-datetime="([^"]+)"/);
    expect(match?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
