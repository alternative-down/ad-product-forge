/**
 * Unit tests for agents/normalize-operational-memory-messages.ts.
 * Tests normalizeOperationalMemoryMessages.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ConversationStore } from '@forge-runtime/core';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),

    errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
    withToolErrorLogging: vi.fn(async (params) => {
      try {
        return { valid: true, data: await params.fn() };
      } catch (error) {
        // Mirror the real impl: use errorMsg-style formatting
        const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
        return { valid: false, error: msg, hint: params.hint || '' };
      }
    }),
  }));

import { normalizeOperationalMemoryMessages } from './normalize-operational-memory-messages';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TestMessage = {
  id: string;
  role?: string;
  operationalMemoryType?: string;
  parts: Array<{ type: string; text?: string }>;
};

function makeMessage(overrides: Partial<TestMessage> = {}): TestMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'hello' }],
    ...overrides,
  };
}

function makeStore(
  overrides: {
    messages?: TestMessage[];
    updateError?: Error;
  } = {},
): ConversationStore {
  const messages = overrides.messages ?? [];
  const updateError = overrides.updateError;
  return {
    listMessages: vi.fn().mockResolvedValue(messages),
    updateMessage: vi.fn().mockImplementation(async () => {
      if (updateError) throw updateError;
    }),
    sendMessage: vi.fn(),
    updateMessageMetadata: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    searchConversations: vi.fn(),
    getMessages: vi.fn(),
  } as unknown as ConversationStore;
}

// ─── normalizeOperationalMemoryMessages ─────────────────────────────────────

describe('normalizeOperationalMemoryMessages', () => {
  it('calls listMessages with threadId and asc order', async () => {
    const store = makeStore({ messages: [] });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-42',
      conversationStore: store,
    });

    expect(store.listMessages).toHaveBeenCalledWith({ threadId: 'thread-42', order: 'asc' });
  });

  it('does not call updateMessage when no messages returned', async () => {
    const store = makeStore();

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it('skips messages without operationalMemoryType', async () => {
    const store = makeStore({
      messages: [makeMessage({ id: 'msg-a', parts: [{ type: 'text', text: 'plain' }] })],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it('skips non-text and non-reasoning parts', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          operationalMemoryType: 'checkpoint',
          parts: [{ type: 'tool-call', text: 'call()' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    // tool-call parts don't get stripped, and the strip just returns the original
    // since there's no prefix, the part text stays the same => no partsChanged
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it('strips "Checkpoint summary:" prefix from text parts', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          operationalMemoryType: 'checkpoint',
          parts: [{ type: 'text', text: 'Checkpoint summary: shared context' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    expect(store.updateMessage).toHaveBeenCalledTimes(1);
    const call = (store.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.messageId).toBe('msg-a');
    expect(call.parts[0].text).toBe('shared context');
  });

  it('strips "Active reflection:" prefix from reasoning parts', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          operationalMemoryType: 'observation',
          parts: [{ type: 'reasoning', text: 'Active reflection: doing work' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    const call = (store.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.parts[0].text).toBe('doing work');
  });

  it('strips "Active observation:" prefix from text parts', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          operationalMemoryType: 'observation',
          parts: [{ type: 'text', text: 'Active observation: found bug' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    const call = (store.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.parts[0].text).toBe('found bug');
  });

  it('strips case-insensitively', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          operationalMemoryType: 'observation',
          parts: [{ type: 'text', text: 'ACTIVE OBSERVATION: content' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    const call = (store.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.parts[0].text).toBe('content');
  });

  it('trims whitespace after stripping prefix', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          operationalMemoryType: 'checkpoint',
          parts: [{ type: 'text', text: '  Checkpoint summary:   spaces   ' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    const call = (store.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.parts[0].text).toBe('spaces');
  });

  it('sets role to assistant in updateMessage', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          role: 'user',
          operationalMemoryType: 'checkpoint',
          parts: [{ type: 'text', text: 'Checkpoint summary: ctx' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    const call = (store.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.role).toBe('assistant');
  });

  it('does not update when role is already assistant and no parts changed', async () => {
    const store = makeStore({
      messages: [
        makeMessage({
          id: 'msg-a',
          role: 'assistant',
          operationalMemoryType: 'checkpoint',
          parts: [{ type: 'text', text: 'plain text' }],
        }),
      ],
    });

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: store,
    });

    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it('logs and re-throws when listMessages fails', async () => {
    vi.mock('@forge-runtime/core', () => ({
      forgeDebug: vi.fn(),
      errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
      withToolErrorLogging: vi.fn(async (params) => {
        try {
          return { valid: true, data: await params.fn() };
        } catch (error) {
          // Mirror the real impl: use errorMsg-style formatting
          const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
          return { valid: false, error: msg, hint: params.hint || '' };
        }
      })
    }));
    const error = new Error('list failed');
    const store = makeStore();
    (store.listMessages as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    await expect(
      normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: store,
      }),
    ).rejects.toThrow('list failed');
  });
});
