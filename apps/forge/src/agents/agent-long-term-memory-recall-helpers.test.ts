import { describe, expect, it, vi } from 'vitest';
import {
  safeSerializeRecallSteps,
  safeSerializeGraphResult,
  escapeXml,
  buildRecallSystemMessage,
} from './agent-ltm-helpers';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

describe('ltm/helpers', () => {
  describe('safeSerializeRecallSteps', () => {
    it('returns formatted JSON for a plain array', () => {
      const steps = [{ role: 'user', content: 'hello' }];
      const result = safeSerializeRecallSteps(steps);
      expect(result).toBe('[\n  {\n    "role": "user",\n    "content": "hello"\n  }\n]');
    });

    it('returns fallback string when JSON.stringify throws', () => {
      const circular: unknown = { a: 1 };
      (circular as any).self = circular;
      expect(safeSerializeRecallSteps([circular])).toBe('[unserializable steps payload]');
    });

    it('handles empty array', () => {
      expect(safeSerializeRecallSteps([])).toBe('[]');
    });

    it('handles deeply nested objects', () => {
      const nested = { a: { b: { c: { d: 'deep' } } } };
      expect(safeSerializeRecallSteps([nested])).toContain('"d": "deep"');
    });

    it('handles null values in array', () => {
      const result = safeSerializeRecallSteps([null, { key: null }]);
      expect(result).toContain('null');
    });

    it('handles undefined values', () => {
      const result = safeSerializeRecallSteps([undefined, { a: undefined }]);
      expect(result).toContain('null'); // JSON.stringify converts undefined to null
    });
  });

  describe('safeSerializeGraphResult', () => {
    it('returns formatted JSON for a plain object', () => {
      const result = { hit: true, context: 'hello world' };
      expect(safeSerializeGraphResult(result)).toContain('hello world');
    });

    it('returns fallback string when JSON.stringify throws', () => {
      const circular: unknown = { x: 1 };
      (circular as any).self = circular;
      expect(safeSerializeGraphResult(circular)).toBe('[unserializable graph result]');
    });

    it('handles null', () => {
      expect(safeSerializeGraphResult(null)).toBe('null');
    });

    it('handles array input', () => {
      expect(safeSerializeGraphResult([{ a: 1 }, { b: 2 }])).toContain('"a": 1');
    });

    it('handles number and boolean values', () => {
      const result = safeSerializeGraphResult({ hit: true, score: 0.95, count: 42 });
      expect(result).toContain('true');
      expect(result).toContain('0.95');
    });
  });

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
      expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes single-quote', () => {
      expect(escapeXml("it's")).toBe("it's".replaceAll("'", '&apos;'));
    });

    it('escapes all characters in mixed string', () => {
      const mixed = 'A & B < C > D "E" \'F\'';
      const result = escapeXml(mixed);
      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&apos;');
    });

    it('returns input unchanged when no special chars', () => {
      expect(escapeXml('hello world')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(escapeXml('')).toBe('');
    });

    it('escapes already-escaped content', () => {
      expect(escapeXml('a &amp; b')).toBe('a &amp;amp; b');
    });
  });

  describe('buildRecallSystemMessage', () => {
    it('returns null when graph hit has empty context and no workspace results', () => {
      expect(
        buildRecallSystemMessage({
          query: 'test',
          graphHit: true,
          graphScore: 0.5,
          graphContext: '',
          results: [],
        }),
      ).toBeNull();
    });

    it('returns memory-recall XML with graph item when graph hits', () => {
      const result = buildRecallSystemMessage({
        query: 'what was done',
        graphHit: true,
        graphScore: 0.8421,
        graphContext: 'The task was completed on Monday',
        results: [],
      });
      expect(result).not.toBeNull();
      expect(result).toContain('<memory-recall');
      expect(result).toContain('source="graph"');
      expect(result).toContain('score="0.8421"');
      expect(result).toContain('The task was completed on Monday');
      expect(result).toContain('</memory-recall>');
    });

    it('returns memory-recall XML with workspace items when graph misses', () => {
      const result = buildRecallSystemMessage({
        query: 'find config',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [
          { id: 'doc-1', content: 'config: { port: 3000 }', score: 0.9 },
          { id: 'doc-2', content: 'database url', score: 0.7 },
        ],
      });
      expect(result).not.toBeNull();
      expect(result).toContain('<memory-recall');
      expect(result).toContain('source="workspace"');
      expect(result).toContain('id="doc-1"');
      expect(result).toContain('score="0.9000"');
      expect(result).toContain('config: { port: 3000 }');
      expect(result).toContain('</memory-recall>');
    });

    // Note: query is not in XML when graphHit=false (only workspace results are included)
    it('escapes XML special chars in workspace result content', () => {
      const result = buildRecallSystemMessage({
        query: 'find <script>',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [{ id: 'doc-x', content: 'value: "test & <data>"', score: 0.8 }],
      });
      // Content escaping: & → &amp; < → &lt; > → &gt; " → &quot;
      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
    });

    it('returns null when no results and no graph hit', () => {
      expect(
        buildRecallSystemMessage({
          query: 'nothing',
          graphHit: false,
          graphScore: null,
          graphContext: '',
          results: [],
        }),
      ).toBeNull();
    });

    it('includes instructions tag with remember guidance', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [{ id: 'd1', content: 'content', score: 0.5 }],
      });
      expect(result).toContain('<instructions>');
      expect(result).toContain('I remember that');
    });

    it('uses null score attribute when graphScore is not a number', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: true,
        graphScore: null,
        graphContext: 'some context',
        results: [],
      });
      expect(result).toContain('source="graph"');
      // null score → no score attribute
      expect(result).not.toContain('score=');
    });

    it('maps workspace result scores to 4 decimal places', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [{ id: 'd1', content: 'x', score: 0.123456789 }],
      });
      expect(result).toContain('score="0.1235"');
    });
  });
});
