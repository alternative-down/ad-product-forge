import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import {
  safeSerializeRecallSteps,
  safeSerializeGraphResult,
  escapeXml,
  buildRecallSystemMessage,
} from './agent-ltm-helpers';

describe('agent-ltm-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('safeSerializeRecallSteps', () => {
    it('serializes a valid array to JSON', () => {
      const result = safeSerializeRecallSteps([{ id: '1', content: 'hello' }]);
      expect(result).toBe('[\n  {\n    "id": "1",\n    "content": "hello"\n  }\n]');
    });

    it('serializes empty array', () => {
      const result = safeSerializeRecallSteps([]);
      expect(result).toBe('[]');
    });

    it('returns fallback string on circular reference', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      const result = safeSerializeRecallSteps([obj]);
      expect(result).toBe('[unserializable steps payload]');
    });

    it('returns fallback string on deep nested structure', () => {
      const deeply = { level: { level: { level: {} } } };
      (deeply as any).circular = deeply;
      const result = safeSerializeRecallSteps([deeply]);
      expect(result).toBe('[unserializable steps payload]');
    });
  });

  describe('safeSerializeGraphResult', () => {
    it('serializes a valid object to JSON', () => {
      const result = safeSerializeGraphResult({ score: 0.95, nodes: ['a', 'b'] });
      expect(result).toContain('"score": 0.95');
      expect(result).toContain('"nodes"');
    });

    it('serializes null', () => {
      const result = safeSerializeGraphResult(null);
      expect(result).toBe('null');
    });

    it('returns fallback string on circular reference', () => {
      const obj: any = { key: 'value' };
      obj.self = obj;
      const result = safeSerializeGraphResult(obj);
      expect(result).toBe('[unserializable graph result]');
    });
  });

  describe('escapeXml', () => {
    it('escapes ampersand', () => {
      expect(escapeXml('A & B')).toBe('A &amp; B');
    });

    it('escapes less-than and greater-than', () => {
      expect(escapeXml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes double quote', () => {
      expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes single quote', () => {
      expect(escapeXml("it's fine")).toBe("it's fine".replace("'", '&apos;'));
    });

    it('escapes all special characters in one string', () => {
      expect(escapeXml('A & B < C > "D" \'E\'')).toBe('A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;');
    });

    it('returns string unchanged when no special chars', () => {
      expect(escapeXml('plain text')).toBe('plain text');
    });

    it('handles empty string', () => {
      expect(escapeXml('')).toBe('');
    });
  });

  describe('buildRecallSystemMessage', () => {
    it('returns null when results array is empty and no graph hit', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [],
      });
      expect(result).toBeNull();
    });

    it('returns null when graph hit but graphContext is empty', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: true,
        graphScore: 0.85,
        graphContext: '',
        results: [],
      });
      expect(result).toBeNull();
    });

    it('returns system message with graph item when graphHit is true', () => {
      const result = buildRecallSystemMessage({
        query: 'what was the issue?',
        graphHit: true,
        graphScore: 0.9234,
        graphContext: 'There was a memory leak in the worker',
        results: [],
      });

      expect(result).not.toBeNull();
      expect(result).toContain('<memory-recall');
      expect(result).toContain('source="graph"');
      expect(result).toContain('score="0.9234"');
      expect(result).toContain('There was a memory leak');
      expect(result).toContain('</memory-recall>');
    });

    it('returns system message with workspace items when graphHit is false', () => {
      const result = buildRecallSystemMessage({
        query: 'test query',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [
          { id: 'doc-1', content: 'First document', score: 0.95 },
          { id: 'doc-2', content: 'Second document', score: 0.87 },
        ],
      });

      expect(result).not.toBeNull();
      expect(result).toContain('<memory-recall');
      expect(result).toContain('source="workspace"');
      expect(result).toContain('id="doc-1"');
      expect(result).toContain('id="doc-2"');
      expect(result).toContain('score="0.9500"');
      expect(result).toContain('First document');
      expect(result).toContain('</memory-recall>');
    });

    it('escapes XML in content', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: false,
        graphScore: null,
        graphContext: '',
        results: [{ id: 'doc-1', content: 'Price < $50 & value > 10', score: 0.5 }],
      });

      expect(result).toContain('&lt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&gt;');
    });

    it('escapes XML in graph item query attribute', () => {
      const result = buildRecallSystemMessage({
        query: 'query with <special> & chars',
        graphHit: true,
        graphScore: 0.5,
        graphContext: 'some context',
        results: [],
      });

      expect(result).toContain('query="query with &lt;special&gt; &amp; chars"');
    });

    it('includes instructions in output', () => {
      const result = buildRecallSystemMessage({
        query: 'test',
        graphHit: true,
        graphScore: 0.5,
        graphContext: 'Some context',
        results: [],
      });

      expect(result).toContain('<instructions>');
    });
  });
});