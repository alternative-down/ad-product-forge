/**
 * Unit tests for agents/ltm/recall/format-helpers.ts
 *
 * Covers pure formatting helpers used by the LTM recall pipeline:
 *  - formatStructuredValue (recursive value → indented string)
 *  - readGraphSources (extract sources array from graph result)
 *  - readGraphSourceDocument (trimmed document string from source)
 *  - buildRecallQueryFromStep (compose recall query from LTM step record)
 *
 * All helpers are pure; tests verify happy paths + edge cases
 * (null/undefined, missing fields, type coercion).
 */
import { describe, expect, it } from 'vitest';
import {
  buildRecallQueryFromStep,
  formatStructuredValue,
  readGraphSourceDocument,
  readGraphSources,
} from './format-helpers';

describe('formatStructuredValue', () => {
  it('returns trimmed string for string values', () => {
    expect(formatStructuredValue('  hello world  ')).toBe('hello world');
  });

  it('returns empty string for null, undefined, or non-objects', () => {
    expect(formatStructuredValue(null)).toBe('');
    expect(formatStructuredValue(undefined)).toBe('');
    expect(formatStructuredValue(42)).toBe('42');
    expect(formatStructuredValue(true)).toBe('true');
  });

  it('renders arrays as bullet lists with indent', () => {
    const result = formatStructuredValue(['one', 'two', 'three'], 0);
    expect(result).toBe('- one\n- two\n- three');
  });

  it('renders nested objects as key:value lines, recursively indented', () => {
    const result = formatStructuredValue({ name: 'Aldric', tags: ['bot', 'dev'] }, 0);
    expect(result).toBe('name: Aldric\ntags:\n  - bot\n  - dev');
  });
});

describe('readGraphSources', () => {
  it('returns empty array for null/undefined or non-object inputs', () => {
    expect(readGraphSources(null)).toEqual([]);
    expect(readGraphSources(undefined)).toEqual([]);
    expect(readGraphSources('not an object')).toEqual([]);
    expect(readGraphSources(42)).toEqual([]);
  });

  it('returns the sources array when present', () => {
    const sources = [{ id: 'a' }, { id: 'b' }];
    expect(readGraphSources({ sources })).toEqual(sources);
  });

  it('returns empty array when sources field is missing or not an array', () => {
    expect(readGraphSources({})).toEqual([]);
    expect(readGraphSources({ sources: 'not-an-array' })).toEqual([]);
    expect(readGraphSources({ sources: null })).toEqual([]);
  });
});

describe('readGraphSourceDocument', () => {
  it('returns trimmed document string when present', () => {
    expect(readGraphSourceDocument({ document: '  some text  ' })).toBe('some text');
  });

  it('returns empty string when source is null/non-object', () => {
    expect(readGraphSourceDocument(null)).toBe('');
    expect(readGraphSourceDocument('not an object')).toBe('');
  });

  it('returns empty string when document is missing or not a string', () => {
    expect(readGraphSourceDocument({})).toBe('');
    expect(readGraphSourceDocument({ document: 42 })).toBe('');
    expect(readGraphSourceDocument({ document: null })).toBe('');
  });
});

describe('buildRecallQueryFromStep', () => {
  it('returns empty string for null, undefined, or non-object steps', () => {
    expect(buildRecallQueryFromStep(null)).toBe('');
    expect(buildRecallQueryFromStep(undefined)).toBe('');
    expect(buildRecallQueryFromStep('not an object')).toBe('');
  });

  it('concatenates text and reasoningText with newlines', () => {
    const result = buildRecallQueryFromStep({
      text: 'search for foo',
      reasoningText: 'because bar',
    });
    expect(result).toBe('search for foo\nbecause bar');
  });

  it('includes tool calls formatted with name and args', () => {
    const result = buildRecallQueryFromStep({
      text: 'query',
      toolCalls: [{ toolName: 'search', args: { q: 'hello' } }],
    });
    expect(result).toContain('query');
    expect(result).toContain('Tool call: search');
    expect(result).toContain('q: hello');
  });

  it('includes tool results formatted with name and result', () => {
    const result = buildRecallQueryFromStep({
      text: 'query',
      toolResults: [{ toolName: 'search', result: { hits: 3 } }],
    });
    expect(result).toContain('query');
    expect(result).toContain('Tool result: search');
    expect(result).toContain('hits: 3');
  });
});
