import { describe, expect, it } from 'vitest';

import { countTokens } from 'agent-runtime-core';
import {
  InMemoryConversationStore,
  type ConversationMessage,
} from 'agent-runtime-core/integrations';

import {
  readOperationalMemoryState,
  takeOperationalMemoryBatch,
} from './operational-memory-state.js';

async function appendMessages(store: InMemoryConversationStore, messages: ConversationMessage[]) {
  for (const message of messages) {
    await store.appendMessage(message);
  }
}

// Generates content that will produce tokens close to target
function generateContentNearTokens(targetTokens: number): { content: string; tokens: number } {
  const baseLine = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
  let content = baseLine;
  let tokens = countTokens(content);

  // Keep adding lines until we exceed target
  while (tokens < targetTokens) {
    content += baseLine;
    tokens = countTokens(content);
  }

  // Binary search for exact token count
  let low = 0;
  let high = content.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const testTokens = countTokens(content.substring(0, mid));

    if (testTokens <= targetTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return { content: content.substring(0, low), tokens: countTokens(content.substring(0, low)) };
}

describe('operational memory grouping', () => {
  it('keeps multi-call tool invocations and tool results together across raw reserve and batch selection', async () => {
    const store = new InMemoryConversationStore();

    // Generate content with tokens close to 2490 to test grouping behavior
    // The tool messages (~8 tokens) combined with large-tail must exceed 2_500
    // so that tool messages go to overflow while large-tail stays in recent
    const { content: largeTailContent } = generateContentNearTokens(2490);

    await appendMessages(store, [
      {
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'checkpoint summary',
          },
        ],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'assistant-tool-call',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Run both checks.',
          },
        ],
        metadata: {
          toolInvocations: [
            {
              toolCallId: 'call-1',
              toolName: 'workspace_execute_command',
              args: {
                command: 'git status --short',
              },
            },
            {
              toolCallId: 'call-2',
              toolName: 'workspace_read_file',
              args: {
                path: 'README.md',
              },
            },
          ],
        },
        createdAt: '2026-01-01T00:00:01.000Z',
      },
      {
        id: 'tool-result',
        threadId: 'thread-1',
        role: 'tool',
        parts: [],
        metadata: {
          toolResults: [
            {
              toolCallId: 'call-1',
              toolName: 'workspace_execute_command',
              result: {
                stdout: ' M src/index.ts',
              },
            },
            {
              toolCallId: 'call-2',
              toolName: 'workspace_read_file',
              result: {
                content: 'hello',
              },
            },
          ],
        },
        createdAt: '2026-01-01T00:00:02.000Z',
      },
      {
        id: 'large-tail',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: largeTailContent,
          },
        ],
        createdAt: '2026-01-01T00:00:03.000Z',
      },
    ]);

    const state = await readOperationalMemoryState({
      threadId: 'thread-1',
      store,
      recentTokenLimit: 2_500,
    });

    // Tool messages should go to overflow since large-tail fills the recent budget
    expect(state.overflowRawMessages.map((message) => message.id)).toEqual([
      'assistant-tool-call',
      'tool-result',
    ]);
    expect(state.recentRawMessages.map((message) => message.id)).toEqual(['large-tail']);

    const batch = takeOperationalMemoryBatch({
      messages: state.overflowRawMessages,
      tokenLimit: 100,
    });

    expect(batch.messages.map((message) => message.id)).toEqual([
      'assistant-tool-call',
      'tool-result',
    ]);
  });
});
