import type { ModelMessage } from 'ai';

import {
  CheckpointedConversationMemory,
  createCheckpointedConversationPlugin,
  type CheckpointedConversationObserver,
  type ConversationMessage,
  type ConversationStore,
  type RuntimeObserver,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { createAssistantConversationPersistencePlugin } from './assistant-conversation-persistence-plugin.js';
import { createConversationModelMessages } from './conversation-model-messages.js';

const AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT =
  'You are an autonomous company agent. Think proactively, decide what to do next inside your role, and continue work without waiting for conversational prompting.';

export type ForgeConversationMemoryOptions = {
  threadId: string;
  conversationStore: ConversationStore;
  stateStore?: unknown;
  assistantAuthorId?: string;
  observer?: CheckpointedConversationObserver;
  recentTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  consolidateOverflow?: boolean;
};

export type ForgeConversationMemory = {
  memory: CheckpointedConversationMemory;
  captureRunHistoryWindow(input: {
    lastMessages: number;
  }): Promise<{
    historyStartMessageId: string | null;
    historyEndMessageId: string | null;
  }>;
  renderModelMessages(input?: {
    historyWindow?: {
      historyStartMessageId: string | null;
      historyEndMessageId: string | null;
    };
  }): Promise<ModelMessage[]>;
  plugins: RuntimePlugin[];
  observers: RuntimeObserver[];
};

export function createForgeConversationMemory(input: ForgeConversationMemoryOptions): ForgeConversationMemory {
  const memory = new CheckpointedConversationMemory({
    threadId: input.threadId,
    store: input.conversationStore,
    observer: input.observer,
    recentTokenLimit: input.recentTokenLimit,
    overflowObservationTokenLimit: input.overflowObservationTokenLimit,
  });

  return {
    memory,
    async captureRunHistoryWindow(options) {
      const activeMessages = await input.conversationStore.listOperationalMemoryMessages({
        threadId: input.threadId,
      });
      const visibleHistory = options.lastMessages > 0
        ? activeMessages.slice(-options.lastMessages)
        : [];

      return {
        historyStartMessageId: visibleHistory[0]?.id ?? null,
        historyEndMessageId: activeMessages.at(-1)?.id ?? null,
      };
    },
    async renderModelMessages(options) {
      const activeMessages = await input.conversationStore.listOperationalMemoryMessages({
        threadId: input.threadId,
      });
      const historyWindow = options?.historyWindow;
      const scopedMessages = historyWindow
        ? selectRunScopedMessages(activeMessages, historyWindow)
        : activeMessages;

      return [
        {
          role: 'user',
          content: [{
            type: 'text' as const,
            text: AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT,
          }],
        } as ModelMessage,
        ...createConversationModelMessages(scopedMessages),
      ];
    },
    plugins: [
      createAssistantConversationPersistencePlugin({
        store: input.conversationStore,
        authorId: input.assistantAuthorId,
        threadId: input.threadId,
      }),
      createCheckpointedConversationPlugin({
        memory,
        consolidateAfterStep: input.consolidateOverflow,
        selectThreadId() {
          return input.threadId;
        },
      }),
    ],
    observers: [] as RuntimeObserver[],
  };
}

function selectRunScopedMessages(
  activeMessages: ConversationMessage[],
  historyWindow: {
    historyStartMessageId: string | null;
    historyEndMessageId: string | null;
  },
) {
  if (!historyWindow.historyStartMessageId) {
    return activeMessages;
  }

  if (!historyWindow.historyEndMessageId) {
    const startIndex = activeMessages.findIndex((message) => message.id === historyWindow.historyStartMessageId);

    return startIndex >= 0 ? activeMessages.slice(startIndex) : activeMessages;
  }

  const historyStartIndex = activeMessages.findIndex((message) => message.id === historyWindow.historyStartMessageId);
  const historyEndIndex = activeMessages.findIndex((message) => message.id === historyWindow.historyEndMessageId);

  if (historyStartIndex < 0 || historyEndIndex < historyStartIndex) {
    return activeMessages;
  }

  return [
    ...activeMessages.slice(historyStartIndex, historyEndIndex + 1),
    ...activeMessages.slice(historyEndIndex + 1),
  ];
}
