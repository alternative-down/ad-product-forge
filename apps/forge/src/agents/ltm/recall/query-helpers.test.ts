import { describe, expect, it } from 'vitest';

import {
  RECALL_INJECTION_RAW_WINDOW_RATIO,
  buildRecallQueryFromStep,
  shouldSkipRecallInjection,
} from './query-helpers';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildRecallQueryFromStep', () => {
  it('returns the text from a step with text', () => {
    const step = { text: 'hello world' };
    expect(buildRecallQueryFromStep(step)).toBe('hello world');
  });

  it('returns the reasoningText from a step', () => {
    const step = { reasoningText: 'thinking out loud' };
    expect(buildRecallQueryFromStep(step)).toBe('thinking out loud');
  });

  it('combines text and reasoningText', () => {
    const step = { text: 'a', reasoningText: 'b' };
    expect(buildRecallQueryFromStep(step)).toContain('a');
    expect(buildRecallQueryFromStep(step)).toContain('b');
  });

  it('returns empty string for step without text or reasoningText', () => {
    const step = {};
    expect(buildRecallQueryFromStep(step)).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(buildRecallQueryFromStep(null)).toBe('');
    expect(buildRecallQueryFromStep(undefined)).toBe('');
  });

  it('returns empty string for non-object step', () => {
    expect(buildRecallQueryFromStep('hello')).toBe('');
    expect(buildRecallQueryFromStep(123)).toBe('');
  });

  it('returns empty string for non-string text field', () => {
    expect(buildRecallQueryFromStep({ text: 123 })).toBe('');
    expect(buildRecallQueryFromStep({ text: { foo: 'bar' } })).toBe('');
  });

  it('trims whitespace from text', () => {
    expect(buildRecallQueryFromStep({ text: '  hello  ' })).toBe('hello');
  });

  it('formats toolCalls using args or input', () => {
    const step = { toolCalls: [{ toolName: 'foo', args: { x: 1 } }] };
    const result = buildRecallQueryFromStep(step);
    expect(result).toContain('foo');
    expect(result).toContain('x: 1');
  });
});

describe('shouldSkipRecallInjection', () => {
  it('returns false when rawWindowMessageCount is 0', () => {
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [],
        rawWindowMessageCount: 0,
      }),
    ).toBe(false);
  });

  it('returns false when rawWindowMessageCount is negative', () => {
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [],
        rawWindowMessageCount: -5,
      }),
    ).toBe(false);
  });

  it('returns false when graph hits but sourcesCount is 0', () => {
    expect(
      shouldSkipRecallInjection({
        graph: { hit: true, sourcesCount: 0 },
        results: [],
        rawWindowMessageCount: 10,
      }),
    ).toBe(false);
  });

  it('returns false when results is empty and graph not hit', () => {
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [],
        rawWindowMessageCount: 10,
      }),
    ).toBe(false);
  });

  it('skips when recall items >= floor(rawWindowMessageCount * ratio)', () => {
    // ratio = 0.25, rawWindow = 10, limit = floor(2.5) = 2
    // 2 items >= 2 → skip
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [{ id: 'a' }, { id: 'b' }] as any,
        rawWindowMessageCount: 10,
      }),
    ).toBe(true);
  });

  it('does not skip when recall items < limit', () => {
    // limit = 2, 1 item < 2 → inject
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [{ id: 'a' }] as any,
        rawWindowMessageCount: 10,
      }),
    ).toBe(false);
  });

  it('uses graph sourcesCount when graph hits', () => {
    // limit = 2, sourcesCount = 2 → skip
    expect(
      shouldSkipRecallInjection({
        graph: { hit: true, sourcesCount: 2 },
        results: [],
        rawWindowMessageCount: 10,
      }),
    ).toBe(true);
  });

  it('treats results.length as recallItemCount when graph not hit', () => {
    // limit = 2, results.length = 3 → skip
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any,
        rawWindowMessageCount: 10,
      }),
    ).toBe(true);
  });

  it('uses Math.max(1, ...) as lower bound for limit', () => {
    // ratio=0.25, rawWindow=1, limit = max(1, floor(0.25)) = max(1, 0) = 1
    // 1 item >= 1 → skip
    expect(
      shouldSkipRecallInjection({
        graph: { hit: false, sourcesCount: 0 },
        results: [{ id: 'a' }] as any,
        rawWindowMessageCount: 1,
      }),
    ).toBe(true);
  });

  it('exports RECALL_INJECTION_RAW_WINDOW_RATIO = 0.25', () => {
    expect(RECALL_INJECTION_RAW_WINDOW_RATIO).toBe(0.25);
  });
});
