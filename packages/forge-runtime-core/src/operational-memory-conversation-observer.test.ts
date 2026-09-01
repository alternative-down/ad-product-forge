import { describe, expect, it, vi } from 'vitest';

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

import { createOperationalMemoryConversationObserver } from './operational-memory-conversation-observer.js';

describe('createOperationalMemoryConversationObserver', () => {
  it('includes tool calls and tool results in the serialized prompt', async () => {
    generateTextMock.mockResolvedValue({
      text: ['<observations>', '* Tool output was observed.', '</observations>'].join('\n'),
    });

    const observer = createOperationalMemoryConversationObserver({
      model: {} as never,
    });

    await observer.observe({
      threadId: 'thread-1',
      messages: [
        {
          id: 'assistant-1',
          threadId: 'thread-1',
          role: 'assistant',
          parts: [],
          metadata: {
            toolInvocations: [
              {
                toolCallId: 'call-1',
                toolName: 'workspace_execute_command',
                args: {
                  command: 'grep -n foo README.md',
                },
              },
            ],
          },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'tool-1',
          threadId: 'thread-1',
          role: 'tool',
          parts: [],
          metadata: {
            toolResults: [
              {
                toolCallId: 'call-1',
                toolName: 'workspace_execute_command',
                result: {
                  stdout: 'foo:1',
                },
              },
            ],
          },
          createdAt: '2026-01-01T00:00:01.000Z',
        },
      ],
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      'Tool Call workspace_execute_command',
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain('grep -n foo README.md');
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain(
      'Tool Result workspace_execute_command',
    );
    expect(generateTextMock.mock.calls[0]?.[0]?.prompt).toContain('"stdout": "foo:1"');
  });
});
