import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildObserverPromptMock,
  buildObserverSystemPromptMock,
  generateTextMock,
  parseObserverOutputMock,
} = vi.hoisted(() => ({
  buildObserverPromptMock: vi.fn(),
  buildObserverSystemPromptMock: vi.fn(() => 'observer-system'),
  generateTextMock: vi.fn(),
  parseObserverOutputMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@mastra/memory/processors', () => ({
  buildObserverPrompt: buildObserverPromptMock,
  buildObserverSystemPrompt: buildObserverSystemPromptMock,
  parseObserverOutput: parseObserverOutputMock,
}));

import { createCheckpointedConversationObserver } from './checkpointed-conversation-observer.js';

describe('createCheckpointedConversationObserver', () => {
  beforeEach(() => {
    buildObserverPromptMock.mockReset();
    buildObserverSystemPromptMock.mockClear();
    generateTextMock.mockReset();
    parseObserverOutputMock.mockReset();

    buildObserverPromptMock.mockReturnValue('observer-prompt');
    generateTextMock.mockResolvedValue({
      text: '<observations>Observed tool output.</observations>',
    });
    parseObserverOutputMock.mockReturnValue({
      observations: 'Observed tool output.',
    });
  });

  it('includes tool calls and tool results in observer prompt messages', async () => {
    const observer = createCheckpointedConversationObserver({
      model: {} as never,
    });

    await observer.observe({
      threadId: 'thread-1',
      messages: [{
        id: 'assistant-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [],
        metadata: {
          toolInvocations: [{
            toolCallId: 'call-1',
            toolName: 'workspace_execute_command',
            args: {
              command: 'grep -n foo README.md',
            },
          }],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      }, {
        id: 'tool-1',
        threadId: 'thread-1',
        role: 'tool',
        parts: [],
        metadata: {
          toolResults: [{
            toolCallId: 'call-1',
            toolName: 'workspace_execute_command',
            result: {
              stdout: 'foo:1',
            },
          }],
        },
        createdAt: '2026-01-01T00:00:01.000Z',
      }],
    });

    expect(buildObserverPromptMock).toHaveBeenCalledTimes(1);

    const promptMessages = buildObserverPromptMock.mock.calls[0]?.[1];

    expect(promptMessages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: expect.objectContaining({
          content: expect.stringContaining('Tool call: workspace_execute_command'),
        }),
      }),
      expect.objectContaining({
        role: 'user',
        content: expect.objectContaining({
          content: expect.stringContaining('Tool result: workspace_execute_command'),
        }),
      }),
    ]);
    expect(promptMessages?.[0]?.content?.content).toContain('grep -n foo README.md');
    expect(promptMessages?.[1]?.content?.content).toContain('"stdout":"foo:1"');
  });
});
