import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ensureRuntimeSessionThread,
  appendRuntimeSessionPromptMessages,
  appendRuntimeSessionModelMessages,
} from './runtime-agent-session-messages.js';

const mockGetThread = vi.fn<() => Promise<unknown>>();
const mockUpsertThread = vi.fn<() => Promise<void>>();
const mockAppendMessage = vi.fn<() => Promise<void>>();

function makeStore() {
  return {
    getThread: mockGetThread,
    upsertThread: mockUpsertThread,
    appendMessage: mockAppendMessage,
  } as never;
}

describe('ensureRuntimeSessionThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new thread when none exists', async () => {
    mockGetThread.mockResolvedValue(null);
    mockUpsertThread.mockResolvedValue(undefined);

    await ensureRuntimeSessionThread({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
    });

    expect(mockGetThread).toHaveBeenCalledWith('thread-1');
    expect(mockUpsertThread).toHaveBeenCalledOnce();
    const thread = mockUpsertThread.mock.calls[0][0];
    expect(thread.id).toBe('thread-1');
    expect(thread.participantIds).toEqual(['agent-42']);
    expect(thread.createdAt).toBeTruthy();
    expect(thread.updatedAt).toBeTruthy();
  });

  it('updates existing thread participantIds and updatedAt', async () => {
    mockGetThread.mockResolvedValue({
      id: 'thread-1',
      participantIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpsertThread.mockResolvedValue(undefined);

    await ensureRuntimeSessionThread({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
    });

    const thread = mockUpsertThread.mock.calls[0][0];
    expect(thread.participantIds).toEqual(['agent-42']);
    expect(thread.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('preserves existing participantIds when non-empty', async () => {
    mockGetThread.mockResolvedValue({
      id: 'thread-1',
      participantIds: ['other-agent'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpsertThread.mockResolvedValue(undefined);

    await ensureRuntimeSessionThread({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
    });

    const thread = mockUpsertThread.mock.calls[0][0];
    expect(thread.participantIds).toEqual(['other-agent']);
  });

  it('does not call upsertThread if getThread throws', async () => {
    mockGetThread.mockRejectedValue(new Error('store error'));

    await expect(ensureRuntimeSessionThread({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
    })).rejects.toThrow('store error');

    expect(mockUpsertThread).not.toHaveBeenCalled();
  });
});

describe('appendRuntimeSessionPromptMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends one user message', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionPromptMessages({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.threadId).toBe('thread-1');
    expect(msg.role).toBe('user');
    expect(msg.parts).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(msg.authorId).toBeUndefined();
    expect(msg.createdAt).toBeTruthy();
  });

  it('appends assistant message with authorId', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionPromptMessages({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
      messages: [{ role: 'assistant', content: 'Hi there' }],
    });

    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.role).toBe('assistant');
    expect(msg.authorId).toBe('agent-42');
  });

  it('appends multiple messages in order', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionPromptMessages({
      store: makeStore(),
      threadId: 'thread-1',
      agentId: 'agent-42',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Help me' },
      ],
    });

    expect(mockAppendMessage).toHaveBeenCalledTimes(3);
    expect(mockAppendMessage.mock.calls[0][0].role).toBe('user');
    expect(mockAppendMessage.mock.calls[1][0].role).toBe('assistant');
    expect(mockAppendMessage.mock.calls[2][0].role).toBe('user');
  });
});

describe('appendRuntimeSessionModelMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends assistant message with text part', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      assistantAuthorId: 'agent-42',
      messages: [{ role: 'assistant', content: 'Hello' }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.role).toBe('assistant');
    expect(msg.parts).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('skips message with empty content and no tool calls', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{ role: 'assistant', content: [] as never }],
    });

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('appends tool-result message', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'tool',
        content: [{
          type: 'tool-result' as const,
          toolCallId: 'call-1',
          toolName: 'get_weather',
          output: { temp: 22 },
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.role).toBe('tool');
    expect(msg.metadata.toolResults).toEqual([
      { toolCallId: 'call-1', toolName: 'get_weather', result: { temp: 22 } },
    ]);
  });

  it('skips tool message with empty content array', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{ role: 'tool', content: [] }],
    });

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('skips non-tool message with empty parts and no tool calls', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'user',
        content: [],
      }],
    });

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });


  it('appends message with tool-call part', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [{
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName: 'send_message',
          input: { target: 'user-1', text: 'hello' },
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.metadata.toolInvocations).toEqual([
      { toolCallId: 'call-1', toolName: 'send_message', args: { target: 'user-1', text: 'hello' } },
    ]);
  });

  it('appends reasoning part with anthropic provider metadata', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [{
          type: 'reasoning' as const,
          text: 'thinking about this',
          providerOptions: { anthropic: { signature: 'sig-abc' } },
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.parts[0]).toMatchObject({
      type: 'reasoning',
      text: 'thinking about this',
      providerMetadata: { anthropic: { signature: 'sig-abc' } },
    });
  });
});

// Additional edge-case tests for internal functions via public API

describe('toConversationMessage edge cases (via appendRuntimeSessionModelMessages)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unwrapToolOutput unwraps json-type output', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'tool',
        content: [{
          type: 'tool-result' as const,
          toolCallId: 'call-1',
          toolName: 'fetch',
          output: { type: 'json' as const, value: { key: 'secret' } },
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    // unwrapToolOutput should return { key: 'secret' }, not the wrapper
    expect(msg.metadata.toolResults).toEqual([
      { toolCallId: 'call-1', toolName: 'fetch', result: { key: 'secret' } },
    ]);
  });

  it('isRecord handles null input (tool-call with null args)', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [{
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName: 'ping',
          input: null,
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    // isRecord(null) === false → args should be {}
    expect(msg.metadata.toolInvocations).toEqual([
      { toolCallId: 'call-1', toolName: 'ping', args: {} },
    ]);
  });

  it('isRecord handles array input (tool-call with array args)', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [{
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName: 'batch',
          input: ['item1', 'item2'],
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    // isRecord(['item1', 'item2']) === false → args should be {}
    expect(msg.metadata.toolInvocations).toEqual([
      { toolCallId: 'call-1', toolName: 'batch', args: {} },
    ]);
  });

  it('reasoning part uses providerMetadata.anthropic when providerOptions is absent', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [{
          type: 'reasoning' as const,
          text: 'thinking',
          providerMetadata: { anthropic: { redactedData: 'rd-xyz' } },
        }],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.parts[0]).toMatchObject({
      type: 'reasoning',
      text: 'thinking',
      providerMetadata: { anthropic: { redactedData: 'rd-xyz' } },
    });
  });

  it('tool message skips non-tool-result content items', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'tool',
        content: [
          { type: 'tool-result' as const, toolCallId: 'call-1', toolName: 'a', output: 'x' },
          { type: 'text' as const, text: 'not a tool-result' }, // filtered out
          { type: 'tool-result' as const, toolCallId: 'call-2', toolName: 'b', output: 'y' },
        ],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.metadata.toolResults).toEqual([
      { toolCallId: 'call-1', toolName: 'a', result: 'x' },
      { toolCallId: 'call-2', toolName: 'b', result: 'y' },
    ]);
  });

  it('skips tool message with non-array content', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'tool',
        content: 'not an array' as never,
      }],
    });

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('message with only tool-call parts (no text) is still appended', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [
          { type: 'tool-call' as const, toolCallId: 'call-1', toolName: 'a', input: {} },
          { type: 'tool-call' as const, toolCallId: 'call-2', toolName: 'b', input: {} },
        ],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.parts).toEqual([]);
    expect(msg.metadata.toolInvocations).toHaveLength(2);
  });

  it('mixed content parts are all preserved', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text' as const, text: 'Hello' },
          { type: 'reasoning' as const, text: 'thinking' },
          { type: 'tool-call' as const, toolCallId: 'call-1', toolName: 'ping', input: null },
          { type: 'text' as const, text: 'World' },
        ],
      }],
    });

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.parts).toHaveLength(3); // 2 text + 1 reasoning (tool-call goes to metadata)
    expect(msg.metadata.toolInvocations).toEqual([
      { toolCallId: 'call-1', toolName: 'ping', args: {} },
    ]);
  });

  it('system message with string content uses assistant authorId', async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    await appendRuntimeSessionModelMessages({
      store: makeStore(),
      threadId: 'thread-1',
      assistantAuthorId: 'agent-42',
      messages: [{ role: 'system', content: 'You are helpful.' }],
    });

    const msg = mockAppendMessage.mock.calls[0][0];
    // system role → no authorId (unlike assistant)
    expect(msg.authorId).toBeUndefined();
    expect(msg.parts).toEqual([{ type: 'text', text: 'You are helpful.' }]);
  });
});
