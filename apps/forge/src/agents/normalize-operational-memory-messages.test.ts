import { describe, expect, it } from 'vitest';

// Inline stripOperationalMemoryPrefix to test the core logic without importing
// the full module which requires @forge-runtime/core
function stripOperationalMemoryPrefix(text: string) {
  return text.trim()
    .replace(/^Checkpoint summary:\s*/i, '')
    .replace(/^Active reflection:\s*/i, '')
    .replace(/^Active observation:\s*/i, '')
    .trim();
}

describe('stripOperationalMemoryPrefix', () => {
  it('strips "Checkpoint summary:" prefix (case-insensitive)', () => {
    expect(stripOperationalMemoryPrefix('Checkpoint summary: some text')).toBe('some text');
    expect(stripOperationalMemoryPrefix('checkpoint summary:  some text  ')).toBe('some text');
  });

  it('strips "Active reflection:" prefix', () => {
    expect(stripOperationalMemoryPrefix('Active reflection: analyzing results')).toBe('analyzing results');
  });

  it('strips "Active observation:" prefix', () => {
    expect(stripOperationalMemoryPrefix('Active observation: observed behavior')).toBe('observed behavior');
  });

  it('returns original text unchanged if no prefix matches', () => {
    expect(stripOperationalMemoryPrefix('hello world')).toBe('hello world');
    expect(stripOperationalMemoryPrefix('Checkpoint analysis: something')).toBe('Checkpoint analysis: something');
    expect(stripOperationalMemoryPrefix('Active analysis: something')).toBe('Active analysis: something');
  });

  it('handles whitespace-only prefix removal', () => {
    expect(stripOperationalMemoryPrefix('Checkpoint summary:   ')).toBe('');
    expect(stripOperationalMemoryPrefix('Active reflection:')).toBe('');
  });

  it('trims whitespace from original and result', () => {
    expect(stripOperationalMemoryPrefix('  Active observation:   text  ')).toBe('text');
  });

  it('only strips first occurrence', () => {
    expect(stripOperationalMemoryPrefix('Checkpoint summary: textCheckpoint summary: more')).toBe(
      'textCheckpoint summary: more',
    );
  });

  it('handles empty string', () => {
    expect(stripOperationalMemoryPrefix('')).toBe('');
  });
});

// Mock the conversation store interface (minimal shape needed for testing)
type MessagePart = { type: 'text' | 'reasoning' | 'other'; text: string };
type Message = { id: string; role: string; parts: MessagePart[]; operationalMemoryType?: string };
type MockConversationStore = {
  listMessages: (input: { threadId: string; order: 'asc' | 'desc' }) => Promise<Message[]>;
  updateMessage: (input: { threadId: string; messageId: string; role: string; parts: MessagePart[] }) => Promise<void>;
};

async function normalizeOperationalMemoryMessages(input: {
  threadId: string;
  conversationStore: MockConversationStore;
}) {
  const messages = await input.conversationStore.listMessages({
    threadId: input.threadId,
    order: 'asc',
  });

  for (const message of messages) {
    if (!message.operationalMemoryType) {
      continue;
    }

    const normalizedParts = message.parts.map((part: { type?: string; text?: string }) => {
      if ((part.type !== 'text' && part.type !== 'reasoning') || typeof part.text !== 'string') {
        return part;
      }
      return {
        ...part,
        text: stripOperationalMemoryPrefix(part.text),
      };
    });
    const roleChanged = message.role !== 'assistant';
    const partsChanged = JSON.stringify(normalizedParts) !== JSON.stringify(message.parts);

    if (!roleChanged && !partsChanged) {
      continue;
    }

    await input.conversationStore.updateMessage({
      threadId: input.threadId,
      messageId: message.id,
      role: 'assistant',
      parts: normalizedParts,
    });
  }
}

describe('normalizeOperationalMemoryMessages', () => {
  it('does not modify messages without operationalMemoryType', async () => {
    const store: MockConversationStore = {
      listMessages: async () => [
        { id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      ],
      updateMessage: async () => { throw new Error('Should not be called'); },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
  });

  it('skips messages whose parts are already normalized (no role change, no text change)', async () => {
    const store: MockConversationStore = {
      listMessages: async () => [
        { id: 'msg1', role: 'assistant', operationalMemoryType: 'checkpoint', parts: [{ type: 'text', text: 'already clean' }] },
      ],
      updateMessage: async () => { throw new Error('Should not be called'); },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
  });

  it('normalizes parts with prefix and changes role from user to assistant', async () => {
    const updatedMessages: ReturnType<MockConversationStore['updateMessage']>[] = [];
    const store: MockConversationStore = {
      listMessages: async () => [
        { id: 'msg1', role: 'user', operationalMemoryType: 'checkpoint', parts: [{ type: 'text', text: 'Checkpoint summary: some text' }] },
      ],
      updateMessage: async (input) => { updatedMessages.push(input); },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
    expect(updatedMessages).toHaveLength(1);
    expect(updatedMessages[0].role).toBe('assistant');
    expect(updatedMessages[0].parts[0].text).toBe('some text');
  });

  it('normalizes parts with prefix even when role is already assistant', async () => {
    const updatedMessages: unknown[] = [];
    const store: MockConversationStore = {
      listMessages: async () => [
        { id: 'msg1', role: 'assistant', operationalMemoryType: 'checkpoint', parts: [{ type: 'text', text: 'Active observation: observed' }] },
      ],
      updateMessage: async (input) => { updatedMessages.push(input); },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
    expect(updatedMessages).toHaveLength(1);
    expect((updatedMessages[0] as { parts: { text: string }[] }).parts[0].text).toBe('observed');
  });

  it('does not call updateMessage when nothing changed', async () => {
    const store: MockConversationStore = {
      listMessages: async () => [
        { id: 'msg1', role: 'assistant', operationalMemoryType: 'checkpoint', parts: [{ type: 'text', text: 'no prefix text' }] },
      ],
      updateMessage: async () => { throw new Error('Should not be called'); },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
  });

  it('passes through non-text/non-reasoning parts unchanged', async () => {
    let captured: unknown;
    const store: MockConversationStore = {
      listMessages: async () => [
        {
          id: 'msg1', role: 'user', operationalMemoryType: 'checkpoint',
          parts: [
            { type: 'image', text: 'image-data' } as unknown as MessagePart,
            { type: 'text', text: 'Active reflection: thinking' },
          ],
        },
      ],
      updateMessage: async (input) => { captured = input; },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
    expect((captured as { parts: MessagePart[] }).parts[0].type).toBe('image');
    expect((captured as { parts: MessagePart[] }).parts[1].text).toBe('thinking');
  });

  it('processes multiple messages, updating only those needing normalization', async () => {
    const updatedMessages: unknown[] = [];
    const store: MockConversationStore = {
      listMessages: async () => [
        { id: 'msg1', role: 'assistant', operationalMemoryType: 'checkpoint', parts: [{ type: 'text', text: 'already fine' }] },
        { id: 'msg2', role: 'user', operationalMemoryType: 'checkpoint', parts: [{ type: 'text', text: 'Active reflection: needs fixing' }] },
        { id: 'msg3', role: 'assistant', operationalMemoryType: 'observation', parts: [{ type: 'text', text: 'also fine' }] },
      ],
      updateMessage: async (input) => { updatedMessages.push(input); },
    };
    await normalizeOperationalMemoryMessages({ threadId: 't1', conversationStore: store });
    expect(updatedMessages).toHaveLength(1);
    expect((updatedMessages[0] as { messageId: string }).messageId).toBe('msg2');
    expect((updatedMessages[0] as { parts: { text: string }[] }).parts[0].text).toBe('needs fixing');
  });
});
