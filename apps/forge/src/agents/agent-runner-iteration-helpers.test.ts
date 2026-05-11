/**
 * Unit tests for agent-runner-iteration-helpers.ts.
 *
 * Groups:
 *   buildIterationLoopSignature — iteration → stable JSON signature
 *   buildRecallStepFromIteration — iteration → LTM recall step format
 *   didIterationProduceVisibleAssistantText — iteration → bool
 *   didIterationUpdateWorkingMemory — iteration → bool
 */
import { describe, expect, it } from 'vitest';
import {
  buildIterationLoopSignature,
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
  didIterationUpdateWorkingMemory,
} from './agent-runner-iteration-helpers';

// ─── buildIterationLoopSignature ───────────────────────────────────────────

describe('buildIterationLoopSignature', () => {
  it('produces a JSON string', () => {
    const result = buildIterationLoopSignature({ text: 'hello', toolCalls: [] });
    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('includes trimmed text', () => {
    const result = JSON.parse(buildIterationLoopSignature({ text: '  hello  ', toolCalls: [] }));
    expect(result.text).toBe('hello');
  });

  it('excludes leading/trailing whitespace from text', () => {
    const result = JSON.parse(buildIterationLoopSignature({ text: '\n\thello\n\t', toolCalls: [] }));
    expect(result.text).toBe('hello');
  });

  it('normalises tool calls to { toolName, args }', () => {
    const iteration = {
      text: 'test',
      toolCalls: [{ name: 'search', args: { query: 'weather' } }],
    };
    const result = JSON.parse(buildIterationLoopSignature(iteration));
    expect(result.toolCalls).toEqual([{ toolName: 'search', args: { query: 'weather' } }]);
  });

  it('maps multiple tool calls', () => {
    const iteration = {
      text: 'test',
      toolCalls: [
        { name: 'search', args: { query: 'x' } },
        { name: 'read', args: { id: '1' } },
      ],
    };
    const result = JSON.parse(buildIterationLoopSignature(iteration));
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].toolName).toBe('search');
    expect(result.toolCalls[1].toolName).toBe('read');
  });

  it('produces stable output for same iteration', () => {
    const iteration = {
      text: 'test',
      toolCalls: [{ name: 'search', args: { query: 'x' } }],
    };
    expect(buildIterationLoopSignature(iteration)).toBe(
      buildIterationLoopSignature(iteration),
    );
  });

  it('produces different output for different text', () => {
    const a = buildIterationLoopSignature({ text: 'a', toolCalls: [] });
    const b = buildIterationLoopSignature({ text: 'b', toolCalls: [] });
    expect(a).not.toBe(b);
  });

  it('produces different output for different tool calls', () => {
    const a = buildIterationLoopSignature({ text: 'x', toolCalls: [{ name: 'a', args: {} }] });
    const b = buildIterationLoopSignature({ text: 'x', toolCalls: [{ name: 'b', args: {} }] });
    expect(a).not.toBe(b);
  });

  it('handles empty tool calls', () => {
    const result = JSON.parse(buildIterationLoopSignature({ text: 'hello', toolCalls: [] }));
    expect(result.toolCalls).toEqual([]);
  });
});

// ─── buildRecallStepFromIteration ──────────────────────────────────────────

describe('buildRecallStepFromIteration', () => {
  it('returns text as-is', () => {
    const result = buildRecallStepFromIteration({
      text: 'The answer is 42.',
      toolCalls: [],
      toolResults: [],
    });
    expect(result.text).toBe('The answer is 42.');
  });

  it('normalises tool calls to { toolName, args }', () => {
    const iteration = {
      text: 'test',
      toolCalls: [{ name: 'search', args: { query: 'weather' } }],
      toolResults: [],
    };
    const result = buildRecallStepFromIteration(iteration);
    expect(result.toolCalls).toEqual([{ toolName: 'search', args: { query: 'weather' } }]);
  });

  it('normalises tool results to { toolName, result }', () => {
    const iteration = {
      text: 'test',
      toolCalls: [],
      toolResults: [{ name: 'search', result: { status: 'ok' } }],
    };
    const result = buildRecallStepFromIteration(iteration);
    expect(result.toolResults).toEqual([{ toolName: 'search', result: { status: 'ok' } }]);
  });

  it('maps multiple tool calls and results', () => {
    const iteration = {
      text: 'test',
      toolCalls: [
        { name: 'a', args: {} },
        { name: 'b', args: { x: 1 } },
      ],
      toolResults: [
        { name: 'a', result: 1 },
        { name: 'b', result: 2 },
      ],
    };
    const result = buildRecallStepFromIteration(iteration);
    expect(result.toolCalls[0].toolName).toBe('a');
    expect(result.toolResults[1].toolName).toBe('b');
  });

  it('preserves arbitrary result values', () => {
    const iteration = {
      text: 'test',
      toolCalls: [],
      toolResults: [{ name: 'fetch', result: [1, 2, 3] }],
    };
    const result = buildRecallStepFromIteration(iteration);
    expect(result.toolResults[0].result).toEqual([1, 2, 3]);
  });
});

// ─── didIterationProduceVisibleAssistantText ───────────────────────────────

describe('didIterationProduceVisibleAssistantText', () => {
  it('returns true when top-level text is non-empty', () => {
    expect(didIterationProduceVisibleAssistantText({ text: 'hello', messages: [] })).toBe(true);
  });

  it('returns true for whitespace-only text', () => {
    // ' ' is truthy-length
    expect(didIterationProduceVisibleAssistantText({ text: ' ', messages: [] })).toBe(true);
  });

  it('returns false for empty top-level text with no messages', () => {
    expect(didIterationProduceVisibleAssistantText({ text: '', messages: [] })).toBe(false);
  });

  it('returns true for assistant message with string content', () => {
    const messages = [{ role: 'assistant', content: 'Hello world' }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(true);
  });

  it('returns true for assistant message with trimmed string content', () => {
    const messages = [{ role: 'assistant', content: '  Hello  ' }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(true);
  });

  it('returns false for non-assistant roles', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(false);
  });

  it('returns false for assistant message with empty content', () => {
    const messages = [{ role: 'assistant', content: '' }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(false);
  });

  it('returns false for assistant message with non-string, non-array content', () => {
    const messages = [{ role: 'assistant', content: null }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(false);
  });

  it('returns true for assistant message with text part in array content', () => {
    const messages = [
      { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
    ];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(true);
  });

  it('ignores non-text parts in array content', () => {
    const messages = [
      { role: 'assistant', content: [{ type: 'tool_call', name: 'search' }] },
    ];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(false);
  });

  it('skips null/undefined messages', () => {
    const messages = [null, undefined, { role: 'assistant', content: 'valid' }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(true);
  });

  it('skips non-object messages', () => {
    const messages = ['not an object', 123, { role: 'assistant', content: 'valid' }];
    expect(didIterationProduceVisibleAssistantText({ text: '', messages })).toBe(true);
  });
});

// ─── didIterationUpdateWorkingMemory ─────────────────────────────────────

describe('didIterationUpdateWorkingMemory', () => {
  it('returns true when updateWorkingMemory is present', () => {
    const iteration = {
      toolCalls: [{ name: 'updateWorkingMemory' }],
    };
    expect(didIterationUpdateWorkingMemory(iteration)).toBe(true);
  });

  it('returns false when updateWorkingMemory is absent', () => {
    const iteration = {
      toolCalls: [{ name: 'search' }, { name: 'read' }],
    };
    expect(didIterationUpdateWorkingMemory(iteration)).toBe(false);
  });

  it('returns false for empty tool calls', () => {
    expect(didIterationUpdateWorkingMemory({ toolCalls: [] })).toBe(false);
  });

  it('detects updateWorkingMemory among other tools', () => {
    const iteration = {
      toolCalls: [{ name: 'search' }, { name: 'updateWorkingMemory' }, { name: 'read' }],
    };
    expect(didIterationUpdateWorkingMemory(iteration)).toBe(true);
  });
});