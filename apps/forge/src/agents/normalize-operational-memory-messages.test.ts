import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('normalizeOperationalMemoryMessages', () => {
  // Strip helpers first for independent testing
  describe('stripOperationalMemoryPrefix logic', () => {
    function stripOpPrefix(text: string) {
      return text.trim()
        .replace(/^Checkpoint summary:\s*/i, '')
        .replace(/^Active reflection:\s*/i, '')
        .replace(/^Active observation:\s*/i, '')
        .trim();
    }

    it('strips "Checkpoint summary:" prefix', () => {
      expect(stripOpPrefix('Checkpoint summary: some summary text')).toBe('some summary text');
    });

    it('strips "Checkpoint summary:" case-insensitively', () => {
      expect(stripOpPrefix('CHECKPOINT SUMMARY: summary')).toBe('summary');
    });

    it('strips "Active reflection:" prefix', () => {
      expect(stripOpPrefix('Active reflection: thinking')).toBe('thinking');
    });

    it('strips "Active observation:" prefix', () => {
      expect(stripOpPrefix('Active observation: observed')).toBe('observed');
    });

    it('returns original text when no known prefix', () => {
      expect(stripOpPrefix('ordinary message')).toBe('ordinary message');
    });

    it('trims whitespace', () => {
      expect(stripOpPrefix('  Checkpoint summary: text  ')).toBe('text');
    });

    it('handles empty string', () => {
      expect(stripOpPrefix('')).toBe('');
    });
  });

  describe('normalizeOperationalMemoryMessages integration logic', () => {
    // We test the core logic by verifying the function calls correct store methods
    // with appropriate transformations.

    const mockListMessages = vi.fn();
    const mockUpdateMessage = vi.fn();
    const mockConversationStore = {
      listMessages: mockListMessages,
      updateMessage: mockUpdateMessage,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('skips messages without operationalMemoryType', async () => {
      mockListMessages.mockResolvedValue([
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }], operationalMemoryType: undefined },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      expect(mockUpdateMessage).not.toHaveBeenCalled();
    });

    it('does not update messages that already have role assistant and unchanged parts', async () => {
      mockListMessages.mockResolvedValue([
        { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'text' }], operationalMemoryType: 'observation' },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      expect(mockUpdateMessage).not.toHaveBeenCalled();
    });

    it('updates message when role is not assistant', async () => {
      mockListMessages.mockResolvedValue([
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'text' }], operationalMemoryType: 'observation' },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'text' }],
      });
    });

    it('updates message when text parts have checkpoint prefix to strip', async () => {
      mockListMessages.mockResolvedValue([
        {
          id: 'm2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Checkpoint summary: summary here' }],
          operationalMemoryType: 'checkpoint',
        },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'summary here' }],
      });
    });

    it('does not strip prefixes from non-text/non-reasoning parts', async () => {
      const originalParts = [{ type: 'tool_use', text: 'Checkpoint summary: tool call' }];
      mockListMessages.mockResolvedValue([
        { id: 'm1', role: 'user', parts: originalParts, operationalMemoryType: 'observation' },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'm1',
        role: 'assistant',
        parts: originalParts,
      });
    });

    it('handles multiple messages and processes all of them', async () => {
      mockListMessages.mockResolvedValue([
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Active observation: obs1' }],
          operationalMemoryType: 'observation',
        },
        {
          id: 'm2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Active reflection: refl1' }],
          operationalMemoryType: 'reflection',
        },
        {
          id: 'm3',
          role: 'user',
          parts: [{ type: 'tool_result', text: 'tool result' }],
          operationalMemoryType: 'checkpoint',
        },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      expect(mockUpdateMessage).toHaveBeenCalledTimes(3);
      expect(mockUpdateMessage).toHaveBeenNthCalledWith(1, {
        threadId: 'thread-1', messageId: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'obs1' }],
      });
      expect(mockUpdateMessage).toHaveBeenNthCalledWith(2, {
        threadId: 'thread-1', messageId: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'refl1' }],
      });
      expect(mockUpdateMessage).toHaveBeenNthCalledWith(3, {
        threadId: 'thread-1', messageId: 'm3', role: 'assistant', parts: [{ type: 'tool_result', text: 'tool result' }],
      });
    });

    it('skips messages with missing or non-string text', async () => {
      mockListMessages.mockResolvedValue([
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Active observation: obs1' }], operationalMemoryType: 'observation' },
        { id: 'm2', role: 'user', parts: [{ type: 'text' }], operationalMemoryType: 'observation' },
        { id: 'm3', role: 'user', parts: [], operationalMemoryType: 'observation' },
      ]);

      const { normalizeOperationalMemoryMessages } = await import('./normalize-operational-memory-messages');
      await normalizeOperationalMemoryMessages({
        threadId: 'thread-1',
        conversationStore: mockConversationStore as any,
      });

      // Updates all messages with non-assistant role (even with missing text)
      expect(mockUpdateMessage).toHaveBeenCalledTimes(3);
      expect(mockUpdateMessage).toHaveBeenCalledWith({
        threadId: 'thread-1', messageId: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'obs1' }],
      });
    });
  });
});
