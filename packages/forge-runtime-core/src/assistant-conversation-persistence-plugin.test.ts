import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAssistantConversationPersistencePlugin } from './assistant-conversation-persistence-plugin.js';

const mockAppendMessage = vi.fn<() => Promise<void>>();

beforeEach(() => {
  mockAppendMessage.mockReset();
  mockAppendMessage.mockResolvedValue(undefined);
});

describe('createAssistantConversationPersistencePlugin', () => {
  it('has correct plugin name', () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });
    expect(plugin.name).toBe('forge-assistant-conversation-persistence');
  });

  it('appends assistant message from model response text', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
      authorId: 'agent-42',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'message' as const, text: '  Hello world  ' }],
          actionRequests: [],
        },
        actionResults: [],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.threadId).toBe('thread-1');
    expect(msg.role).toBe('assistant');
    expect(msg.authorId).toBe('agent-42');
    expect(msg.parts).toEqual([{ type: 'text', text: 'Hello world' }]);
    expect(msg.metadata.runtimeId).toBe('runtime-abc');
    expect(msg.metadata.stepId).toBe('step-1');
    expect(msg.metadata.stepNumber).toBe(1);
    expect(msg.metadata.toolInvocations).toEqual([]);
    expect(msg.metadata.toolResults).toEqual([]);
  });

  it('appends tool invocations as metadata', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'message', text: 'Tool result' }],
          actionRequests: [{ name: 'send_message', input: { target: 'user-1', text: 'hello' } }],
        },
        actionResults: [],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.metadata.toolInvocations).toEqual([
      { toolName: 'send_message', args: { target: 'user-1', text: 'hello' } },
    ]);
  });

  it('appends tool results as metadata', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'message', text: 'Done' }],
          actionRequests: [],
        },
        actionResults: [{ name: 'send_message', output: { delivered: true } }],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.metadata.toolResults).toEqual([
      { toolName: 'send_message', result: { delivered: true } },
    ]);
  });

  it('skips when model response has no text, no tool calls, and no tool results', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'message', text: '   ' }],
          actionRequests: [],
        },
        actionResults: [],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('skips when model response segments are empty', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [],
          actionRequests: [],
        },
        actionResults: [],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('skips when only non-message segments exist', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'reasoning' as const, text: 'thinking...' }],
          actionRequests: [],
        },
        actionResults: [],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('uses message id with assistant suffix', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-xyz',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'message', text: 'Result' }],
          actionRequests: [],
        },
        actionResults: [],
        finishedAt: '2026-01-01T00:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.id).toBe('step-xyz:assistant');
  });

  it('uses createdAt from finishedAt timestamp', async () => {
    const plugin = createAssistantConversationPersistencePlugin({
      store: { appendMessage: mockAppendMessage } as never,
      threadId: 'thread-1',
    });

    await plugin.onAfterStep!({
      record: {
        id: 'step-1',
        stepNumber: 1,
        modelResponse: {
          segments: [{ kind: 'message', text: 'hello' }],
          actionRequests: [],
        },
        actionResults: [],
        finishedAt: '2026-04-29T12:00:00.000Z',
      },
      snapshot: { runtimeId: 'runtime-abc' },
    } as never);

    expect(mockAppendMessage).toHaveBeenCalledOnce();
    const msg = mockAppendMessage.mock.calls[0][0];
    expect(msg.createdAt).toBe('2026-04-29T12:00:00.000Z');
  });
});
