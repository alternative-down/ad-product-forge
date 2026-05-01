import { describe, expect, it, vi } from 'vitest';
import { normalizeOperationalMemoryMessages } from './normalize-operational-memory-messages';

function createMockMessage(overrides: Partial<{
  id: string;
  role: string;
  operationalMemoryType: string | null;
  parts: Array<{ type?: string; text?: string }>;
}> = {}) {
  return {
    id: 'msg-1',
    role: 'user',
    operationalMemoryType: null,
    parts: [{ type: 'text', text: 'hello' }],
    ...overrides,
  };
}

describe('normalizeOperationalMemoryMessages', () => {
  it('skips messages without operationalMemoryType', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({ operationalMemoryType: null }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('normalizes checkpoint summary prefix', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'checkpoint',
          role: 'user',
          parts: [{ type: 'text', text: 'Checkpoint summary: some text' }],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'some text' }],
    });
  });

  it('normalizes active reflection prefix', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'reflection',
          role: 'user',
          parts: [{ type: 'text', text: 'Active reflection: observing things' }],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'observing things' }],
    });
  });

  it('normalizes active observation prefix', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'observation',
          role: 'user',
          parts: [{ type: 'text', text: 'Active observation: the state is X' }],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'the state is X' }],
    });
  });

  it('does not update when role is assistant and parts have no prefix to strip', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'checkpoint',
          role: 'assistant',
          parts: [{ type: 'text', text: 'already clean text' }],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('updates when parts changed even if role is already assistant', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'checkpoint',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Checkpoint summary: changed text' }],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalled();
  });

  it('ignores non-text and non-reasoning parts', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'checkpoint',
          role: 'user',
          parts: [
            { type: 'image', text: 'image data' },
            { type: 'text', text: 'Checkpoint summary: text part' },
          ],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [
        { type: 'image', text: 'image data' },
        { type: 'text', text: 'text part' },
      ],
    });
  });

  it('handles multiple messages', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({ id: 'msg-1', operationalMemoryType: 'checkpoint', role: 'user', parts: [{ type: 'text', text: 'Checkpoint summary: first' }] }),
        createMockMessage({ id: 'msg-2', operationalMemoryType: null, role: 'user', parts: [{ type: 'text', text: 'normal message' }] }),
        createMockMessage({ id: 'msg-3', operationalMemoryType: 'reflection', role: 'user', parts: [{ type: 'text', text: 'Active reflection: second' }] }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledTimes(2);
    expect(updateMessage).toHaveBeenNthCalledWith(1, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'first' }],
    });
    expect(updateMessage).toHaveBeenNthCalledWith(2, {
      threadId: 'thread-1',
      messageId: 'msg-3',
      role: 'assistant',
      parts: [{ type: 'text', text: 'second' }],
    });
  });

  it('handles reasoning type parts', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'checkpoint',
          role: 'user',
          parts: [
            { type: 'reasoning', text: 'Checkpoint summary: thinking step 1' },
            { type: 'text', text: 'Active observation: done' },
          ],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'thinking step 1' },
        { type: 'text', text: 'done' },
      ],
    });
  });

  it('skips parts with undefined text', async () => {
    const updateMessage = vi.fn();
    const mockStore = {
      listMessages: vi.fn().mockResolvedValue([
        createMockMessage({
          operationalMemoryType: 'checkpoint',
          role: 'user',
          parts: [
            { type: 'text' },
            { type: 'text', text: 'Checkpoint summary: real text' },
          ],
        }),
      ]),
      updateMessage,
    };

    await normalizeOperationalMemoryMessages({
      threadId: 'thread-1',
      conversationStore: mockStore as never,
    });

    expect(updateMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messageId: 'msg-1',
      role: 'assistant',
      parts: [
        { type: 'text' },
        { type: 'text', text: 'real text' },
      ],
    });
  });
});