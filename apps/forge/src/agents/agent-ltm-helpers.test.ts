import { describe, expect, it, vi } from 'vitest';

// Mock @forge-runtime/core before importing the module under test
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import {
  escapeXml,
  buildRecallSystemMessage,
  safeSerializeRecallSteps,
  safeSerializeGraphResult,
} from './agent-ltm-helpers';

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes less-than and greater-than', () => {
    expect(escapeXml('<hello>')).toBe('&lt;hello&gt;');
  });

  it('escapes double-quote', () => {
    expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single-quote', () => {
    expect(escapeXml("it's fine")).toBe("it&apos;s fine");
  });

  it('escapes all special chars', () => {
    const input = "a & b < c > d \"e\" 'f'";
    const output = escapeXml(input);
    expect(output).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
  });

  it('returns unchanged string with no special chars', () => {
    expect(escapeXml('hello world 123')).toBe('hello world 123');
  });
});

describe('safeSerializeRecallSteps', () => {
  it('serializes valid data', () => {
    const steps = [{ id: '1', content: 'hello' }];
    expect(safeSerializeRecallSteps(steps)).toBe(JSON.stringify(steps, null, 2));
  });

  it('returns fallback on circular reference', () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    expect(safeSerializeRecallSteps([circular])).toBe('[unserializable steps payload]');
  });

  it('returns fallback on bigint', () => {
    expect(safeSerializeRecallSteps([BigInt(42)])).toBe('[unserializable steps payload]');
  });
});

describe('safeSerializeGraphResult', () => {
  it('serializes valid data', () => {
    const result = { nodes: ['a', 'b'], edges: [] };
    expect(safeSerializeGraphResult(result)).toBe(JSON.stringify(result, null, 2));
  });

  it('returns fallback on circular reference', () => {
    const circular: any = { x: 1 };
    circular.x = circular;
    expect(safeSerializeGraphResult(circular)).toBe('[unserializable graph result]');
  });
});

describe('buildRecallSystemMessage', () => {
  it('returns null when no results and no graph context', () => {
    const result = buildRecallSystemMessage({
      query: 'what did we discuss?',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when graph hit but empty graph context', () => {
    const result = buildRecallSystemMessage({
      query: 'what did we discuss?',
      graphHit: true,
      graphScore: 0.95,
      graphContext: '   ',
      results: [],
    });
    expect(result).toBeNull();
  });

  it('returns memory-recall XML with graph hit', () => {
    const result = buildRecallSystemMessage({
      query: 'project X',
      graphHit: true,
      graphScore: 0.9523,
      graphContext: 'We discussed project X last week.',
      results: [],
    });
    expect(result).toContain('<memory-recall');
    expect(result).toContain('on-datetime="');
    expect(result).toContain('source="graph"');
    expect(result).toContain('score="0.9523"');
    expect(result).toContain('We discussed project X last week.');
    expect(result).not.toContain('source="workspace"');
  });

  it('returns memory-recall XML with workspace results (no graph hit)', () => {
    const result = buildRecallSystemMessage({
      query: 'project X',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [
        { id: 'result-1', content: 'First discussion about X', score: 0.87 },
        { id: 'result-2', content: 'Second discussion about X', score: 0.65 },
      ],
    });
    expect(result).toContain('<memory-recall');
    expect(result).toContain('source="workspace"');
    expect(result).toContain('id="result-1"');
    expect(result).toContain('score="0.8700"');
    expect(result).toContain('First discussion about X');
    expect(result).toContain('id="result-2"');
    expect(result).toContain('score="0.6500"');
  });

  it('escapes XML special chars in content', () => {
    const result = buildRecallSystemMessage({
      query: 'query',
      graphHit: false,
      graphScore: null,
      graphContext: '',
      results: [{ id: 'r1', content: 'a < b & c > d', score: 0.5 }],
    });
    expect(result).not.toContain('a < b');
    expect(result).toContain('&lt; b &amp; c &gt; d');
  });

  it('escapes XML special chars in query (graph hit branch)', () => {
    const result = buildRecallSystemMessage({
      query: 'a < b & c > d',
      graphHit: true,
      graphScore: 0.5,
      graphContext: 'graph context here',
      results: [],
    });
    expect(result).toContain('query="a &lt; b &amp; c &gt; d"');
  });
});
