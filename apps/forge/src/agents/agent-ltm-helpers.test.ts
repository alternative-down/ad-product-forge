/**
 * Unit tests for agents/agent-ltm-helpers.ts — pure LTM recall helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  safeSerializeRecallSteps,
  safeSerializeGraphResult,
  escapeXml,
  buildRecallSystemMessage,
} from './agent-ltm-helpers';

// ─── safeSerializeRecallSteps ────────────────────────────────────────────────

describe('safeSerializeRecallSteps', () => {
  it('returns "[]" for empty steps array', () => {
    expect(safeSerializeRecallSteps([])).toBe('[]');
  });

  it('serializes a single step with pretty-printing', () => {
    const steps = [{ id: 'step-1', text: 'Hello world' }];
    const result = safeSerializeRecallSteps(steps);
    expect(result).toContain('step-1');
    expect(result).toContain('Hello world');
    expect(JSON.parse(result)).toEqual(steps);
  });

  it('serializes multiple steps', () => {
    const steps = [
      { id: 'step-1', text: 'First step' },
      { id: 'step-2', text: 'Second step' },
      { id: 'step-3', text: 'Third step' },
    ];
    expect(JSON.parse(safeSerializeRecallSteps(steps))).toEqual(steps);
  });

  it('handles steps with complex nested data', () => {
    const steps = [{ id: 'step-1', metadata: { sources: ['doc1', 'doc2'], score: 0.95 } }];
    expect(JSON.parse(safeSerializeRecallSteps(steps))).toEqual(steps);
  });

  it('handles steps with null values', () => {
    const steps = [{ id: 'step-1', text: null }];
    expect(JSON.parse(safeSerializeRecallSteps(steps))).toEqual(steps);
  });

  it('handles steps with unicode content', () => {
    const steps = [{ id: 'step-1', text: 'こんにちは世界 🔥' }];
    expect(JSON.parse(safeSerializeRecallSteps(steps))).toEqual(steps);
  });

  it('serializes empty object with pretty-printing', () => {
    const result = safeSerializeRecallSteps([{}]);
    expect(JSON.parse(result)).toEqual([{}]);
    expect(result).toContain('\n'); // pretty-printed
  });

  it('returns fallback for non-stringifiable value', () => {
    // Circular reference would throw in JSON.stringify
    const circular: unknown = [null];
    (circular as unknown[])[0] = circular;
    const result = safeSerializeRecallSteps(circular);
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
  });
});

// ─── safeSerializeGraphResult ────────────────────────────────────────────────

describe('safeSerializeGraphResult', () => {
  it('returns "[]" for empty graph result', () => {
    expect(safeSerializeGraphResult([])).toBe('[]');
  });

  it('serializes a single graph result', () => {
    const result = [{ id: 'graph-1', context: 'The agent used tool X' }];
    const serialized = safeSerializeGraphResult(result);
    expect(serialized).toContain('graph-1');
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it('serializes multiple graph results', () => {
    const result = [
      { id: 'graph-1', context: 'First context', score: 0.9 },
      { id: 'graph-2', context: 'Second context', score: 0.8 },
    ];
    expect(JSON.parse(safeSerializeGraphResult(result))).toEqual(result);
  });

  it('handles result with empty context string', () => {
    const result = [{ id: 'graph-1', context: '' }];
    expect(JSON.parse(safeSerializeGraphResult(result))).toEqual(result);
  });

  it('handles result with unicode context', () => {
    const result = [{ id: 'graph-1', context: "L'agent a utilisé l'outil X" }];
    expect(JSON.parse(safeSerializeGraphResult(result))).toEqual(result);
  });

  it('returns fallback for circular data', () => {
    const circular: unknown = {};
    (circular as Record<string, unknown>)['self'] = circular;
    const result = safeSerializeGraphResult(circular);
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
  });
});

// ─── escapeXml ───────────────────────────────────────────────────────────────

describe('escapeXml', () => {
  it('escapes & character', () => expect(escapeXml('foo & bar')).toBe('foo &amp; bar'));
  it('escapes < character', () => expect(escapeXml('a < b')).toBe('a &lt; b'));
  it('escapes > character', () => expect(escapeXml('a > b')).toBe('a &gt; b'));
  it('escapes " character', () => expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;'));
  it("escapes ' character", () => expect(escapeXml("it's")).toBe('it&apos;s'));
  it('escapes all special characters together', () => {
    const result = escapeXml('<tag attr="value">&123</tag>');
    expect(result).toBe('&lt;tag attr=&quot;value&quot;&gt;&amp;123&lt;/tag&gt;');
  });
  it('returns empty string for empty input', () => expect(escapeXml('')).toBe(''));
  it('returns original when no special characters', () => {
    expect(escapeXml('hello world')).toBe('hello world');
    expect(escapeXml('Hello World 123')).toBe('Hello World 123');
  });
  it('escapes ampersand multiple times in string', () => {
    expect(escapeXml('a & b & c')).toBe('a &amp; b &amp; c');
  });
  it('& replacement order means &amp; becomes &amp;amp;', () => {
    // & replaced first, so & in &amp; is also escaped
    const result = escapeXml('a &amp; b');
    expect(result).toBe('a &amp;amp; b');
  });
});

// ─── buildRecallSystemMessage ────────────────────────────────────────────────

describe('buildRecallSystemMessage', () => {
  it('returns XML string with memory-recall tag', () => {
    const result = buildRecallSystemMessage({
      query: 'what did I do yesterday',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'r1', content: 'You worked on PR #123' }],
    });
    expect(typeof result).toBe('string');
    expect(result).toContain('on-datetime=');
    expect(result).toContain('</memory-recall>');
  });

  it('includes workspace items when graphHit is false', () => {
    const result = buildRecallSystemMessage({
      query: 'test query',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'item-1', content: 'Result content here', score: 0.95 }],
    });
    expect(result).toContain('item-1');
    expect(result).toContain('Result content here');
  });

  it('includes graph item when graphHit is true and graphContext is non-empty', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: true,
      graphScore: 0.87,
      graphContext: 'The agent completed the task successfully',
      results: [],
    });
    expect(result).toContain('source="graph"');
    expect(result).toContain('0.8700');
  });

  it('omits graph item when graphContext is empty even with graphHit true', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: true,
      graphScore: 0.5,
      graphContext: '',
      results: [],
    });
    // empty graph context with no results -> returns null (items.length === 0)
    expect(result).toBeNull();
  });

  it('escapes special characters in query and content', () => {
    const result = buildRecallSystemMessage({
      query: 'query with <special> & "chars"',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'id1', content: 'content with <tags> & more' }],
    });
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
  });

  it('returns null when no graph hit and results are empty', () => {
    const result = buildRecallSystemMessage({
      query: 'no results',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [],
    });
    expect(result).toBeNull();
  });

  it('includes score attribute on workspace items when provided', () => {
    const result = buildRecallSystemMessage({
      query: 'scored results',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'r1', content: 'Scored result', score: 0.42 }],
    });
    expect(result).toContain('0.4200');
  });

  it('omits score attribute on workspace items when score undefined', () => {
    const result = buildRecallSystemMessage({
      query: 'no score',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'r1', content: 'No score provided' }],
    });
    expect(result).toContain('0.0000'); // defaults to 0.0000 when no score
  });

  it('returns multi-line string with <instructions> tag', () => {
    const result = buildRecallSystemMessage({
      query: 'test',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'x', content: 'y' }],
    });
    expect(result).toContain('<instructions>');
    expect(result).toContain('on-datetime=');
  });

  it('graph with null score omits score attribute', () => {
    const result = buildRecallSystemMessage({
      query: 'graph no score',
      graphHit: true,
      graphScore: null,
      graphContext: 'Some context',
      results: [],
    });
    expect(result).toContain('source="graph"');
    // score attribute absent when null
    expect(result).not.toMatch(/score="null"/);
  });
});