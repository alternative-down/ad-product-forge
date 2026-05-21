import { describe, expect, it } from 'vitest';
import {
  mergeToolLogMessages,
  buildThreadToolInvocationParts,
  type ToolLogMessage,
} from './agent-home-metrics-tool-helpers';

function makeMsg(overrides: Partial<ToolLogMessage> = {}): ToolLogMessage {
  return {
    id: 'id-1',
    role: 'user',
    threadId: 't1',
    createdAt: '2025-01-01T00:00:00.000Z',
    parts: [],
    ...overrides,
  };
}

describe('mergeToolLogMessages', () => {
  it('returns empty array for empty input', () => {
    expect(mergeToolLogMessages([])).toEqual([]);
  });

  it('passes through single message', () => {
    const msg = makeMsg({ id: 'msg-1' });
    expect(mergeToolLogMessages([msg])).toEqual([msg]);
  });

  it('keeps unrelated messages unchanged', () => {
    const a = makeMsg({ id: 'msg-1', role: 'user' });
    const b = makeMsg({ id: 'msg-2', role: 'assistant' });
    expect(mergeToolLogMessages([a, b])).toEqual([a, b]);
  });

  it('does not merge when assistant has no tool invocations', () => {
    const assistant = makeMsg({ id: 'msg-1', role: 'assistant', metadata: {} });
    const tool = makeMsg({ id: 'msg-2', role: 'tool', metadata: { toolResults: [{}] } });
    const result = mergeToolLogMessages([assistant, tool]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(assistant);
    expect(result[1]).toBe(tool);
  });

  it('does not merge when tool has no tool results', () => {
    const assistant = makeMsg({
      id: 'msg-1',
      role: 'assistant',
      metadata: { toolInvocations: [{ toolName: 'foo' }] },
    });
    const tool = makeMsg({ id: 'msg-2', role: 'tool', metadata: {} });
    const result = mergeToolLogMessages([assistant, tool]);
    expect(result).toHaveLength(2);
  });

  it('merges assistant+tool when both have content', () => {
    const assistant = makeMsg({
      id: 'msg-1',
      role: 'assistant',
      metadata: { toolInvocations: [{ toolName: 'foo', toolCallId: 'tc-1' }] },
    });
    const tool = makeMsg({
      id: 'msg-2',
      role: 'tool',
      metadata: { toolResults: [{ toolCallId: 'tc-1', result: { ok: true } }] },
    });
    const result = mergeToolLogMessages([assistant, tool]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg-1');
    expect(result[0].metadata?.toolResults).toEqual([{ toolCallId: 'tc-1', result: { ok: true } }]);
  });

  it('does not merge non-adjacent pairs', () => {
    const a = makeMsg({
      id: 'msg-1',
      role: 'assistant',
      metadata: { toolInvocations: [{ toolName: 'foo' }] },
    });
    const b = makeMsg({ id: 'msg-2', role: 'user' }); // interrupt
    const c = makeMsg({
      id: 'msg-3',
      role: 'assistant',
      metadata: { toolInvocations: [{ toolName: 'bar' }] },
    });
    const d = makeMsg({
      id: 'msg-4',
      role: 'tool',
      metadata: { toolResults: [{ toolCallId: 'bar-tc', result: {} }] },
    });

    const result = mergeToolLogMessages([a, b, c, d]);

    expect(result).toHaveLength(3);
    // msg-1 and msg-2 unchanged
    expect(result[0].id).toBe('msg-1');
    expect(result[1].id).toBe('msg-2');
    // msg-3 and msg-4 merged
    expect(result[2].id).toBe('msg-3');
    expect(result[2].metadata?.toolResults).toEqual([{ toolCallId: 'bar-tc', result: {} }]);
  });

  it('handles multiple consecutive tool messages', () => {
    const assistant = makeMsg({
      id: 'msg-1',
      role: 'assistant',
      metadata: { toolInvocations: [{ toolName: 'a' }] },
    });
    const tool1 = makeMsg({
      id: 'msg-2',
      role: 'tool',
      metadata: { toolResults: [{ toolCallId: 'a-tc', result: 1 }] },
    });
    const tool2 = makeMsg({
      id: 'msg-3',
      role: 'tool',
      metadata: { toolResults: [{ toolCallId: 'b-tc', result: 2 }] },
    });

    const result = mergeToolLogMessages([assistant, tool1, tool2]);

    // Both tool messages merge sequentially into msg-1.
    // Step 1: msg-1 + tool1 → { toolInvocations:[a], toolResults:[a-tc] }
    // Step 2: merged + tool2 → REPLACE: { toolInvocations:[a], toolResults:[b-tc] }
    // Final: 1 message, toolResults=[{ toolCallId: 'b-tc', result: 2 }]
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg-1');
    expect(result[0].metadata?.toolResults).toEqual([{ toolCallId: 'b-tc', result: 2 }]);
  });
});

describe('buildThreadToolInvocationParts', () => {
  it('returns empty array for undefined metadata', () => {
    expect(buildThreadToolInvocationParts(undefined)).toEqual([]);
  });

  it('returns empty array when no toolInvocations or toolResults', () => {
    expect(buildThreadToolInvocationParts({})).toEqual([]);
    expect(buildThreadToolInvocationParts({ foo: 'bar' })).toEqual([]);
  });

  it('creates tool-call parts for invocations', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [
        { toolCallId: 'tc-1', toolName: 'send_message', args: { text: 'hello' } },
        { toolCallId: 'tc-2', toolName: 'workspace_write_file', args: { path: '/a' } },
      ],
      toolResults: [],
    });

    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tc-1',
      toolName: 'send_message',
    });
    expect(parts[0].args).toEqual({ text: 'hello' });
    expect(parts[1]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tc-2',
      toolName: 'workspace_write_file',
    });
  });

  it('attaches result to tool-call when matching toolResult found', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [{ toolCallId: 'tc-1', toolName: 'send_message', args: {} }],
      toolResults: [{ toolCallId: 'tc-1', result: { messageId: 'msg-123' } }],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveProperty('result');
    expect((parts[0] as any).result).toEqual({
      toolCallId: 'tc-1',
      result: { messageId: 'msg-123' },
    });
  });

  it('does not attach result when toolCallId does not match', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [{ toolCallId: 'tc-1', toolName: 'send_message', args: {} }],
      toolResults: [{ toolCallId: 'tc-999', result: {} }],
    });

    expect(parts).toHaveLength(2);
    // tool-call part without result
    expect(parts[0]).toMatchObject({ type: 'tool-call', toolName: 'send_message' });
    expect(parts[0]).not.toHaveProperty('result');
    // unmatched tool result appended as tool-result part
    expect(parts[1]).toMatchObject({ type: 'tool-result' });
  });

  it('skips invocations with non-object or null toolInvocation', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [
        null,
        'not an object',
        { toolCallId: 'tc-1', toolName: 'send_message' },
      ] as any,
      toolResults: [],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].toolName).toBe('send_message');
  });

  it('skips invocations with non-string toolName', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [
        { toolCallId: 'tc-1', toolName: 42 },
        { toolCallId: 'tc-2', toolName: 'send_message' },
      ] as any,
      toolResults: [],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].toolName).toBe('send_message');
  });

  it('appends unmatched tool results as tool-result parts', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [],
      toolResults: [{ toolCallId: 'orphan-tc', result: { data: 'x' } }],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: 'tool-result' });
    expect((parts[0] as any).toolCallId).toBe('orphan-tc');
  });

  it('correctly pairs multiple invocations with results', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [
        { toolCallId: 'a', toolName: 'foo', args: {} },
        { toolCallId: 'b', toolName: 'bar', args: {} },
        { toolCallId: 'c', toolName: 'baz', args: {} },
      ],
      toolResults: [
        { toolCallId: 'b', result: 'result-b' },
        { toolCallId: 'c', result: 'result-c' },
      ],
    });

    expect(parts).toHaveLength(3);
    expect((parts[0] as any).result).toBeUndefined();
    expect((parts[1] as any).result).toEqual({ toolCallId: 'b', result: 'result-b' });
    expect((parts[2] as any).result).toEqual({ toolCallId: 'c', result: 'result-c' });
  });

  it('handles null toolCallId on invocation (uses undefined lookup)', () => {
    const parts = buildThreadToolInvocationParts({
      toolInvocations: [{ toolCallId: null, toolName: 'send_message' }],
      toolResults: [],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].toolCallId).toBeNull();
  });
});
