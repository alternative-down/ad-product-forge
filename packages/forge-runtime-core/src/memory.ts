/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { ModelMessage } from 'ai';

import {
  OperationalMemoryConversationMemory,
  createOperationalMemoryConversationPlugin,
  type OperationalMemoryConversationObserver,
  type ConversationMessage,
  type ConversationStore,
  type RuntimeObserver,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { createAssistantConversationPersistencePlugin } from './assistant-conversation-persistence-plugin.js';
import { createConversationModelMessages } from './conversation-model-messages.js';

const AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT =
  'You are an autonomous company agent. Think proactively, decide what to do next inside your role, and continue work without waiting for conversational prompting.';

/**
 * Builds the autonomous-context ModelMessage that prepends every render call.
 * Factory function avoids the `as ModelMessage` cast by making the structural
 * type explicit at the construction site (L#NN-19 v1.5 + L#NN-50 #18 v10).
 */
function createAutonomousContextMessage(): ModelMessage {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT,
      },
    ],
  };
}

export type ForgeConversationMemoryOptions = {
  threadId: string;
  conversationStore: ConversationStore;
  assistantAuthorId?: string;
  observer?: OperationalMemoryConversationObserver;
  recentTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  consolidateOverflow?: boolean;
};

export type ForgeConversationMemory = {
  memory: OperationalMemoryConversationMemory;
  captureRunHistoryWindow(input: { lastMessages: number }): Promise<{
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

export function createForgeConversationMemory(
  input: ForgeConversationMemoryOptions,
): ForgeConversationMemory {
  const memory = new OperationalMemoryConversationMemory({
    threadId: input.threadId,
    store: input.conversationStore,
    observer: input.observer,
    recentTokenLimit: input.recentTokenLimit,
    overflowObservationTokenLimit: input.overflowObservationTokenLimit,
    maxObservationBatchesPerStabilize: input.consolidateOverflow ? 1 : undefined,
  });

  return {
    memory,
    async captureRunHistoryWindow(options) {
      const activeMessages = await memory.renderActiveMessages();
      const visibleHistory =
        options.lastMessages > 0 ? activeMessages.slice(-options.lastMessages) : [];

      return {
        historyStartMessageId: visibleHistory[0]?.id ?? null,
        historyEndMessageId: activeMessages.at(-1)?.id ?? null,
      };
    },
    async renderModelMessages(options) {
      const activeMessages = await memory.renderActiveMessages();
      const historyWindow = options?.historyWindow;
      const scopedMessages = historyWindow
        ? selectRunScopedMessages(activeMessages, historyWindow)
        : activeMessages;

      return [createAutonomousContextMessage(), ...createConversationModelMessages(scopedMessages)];
    },
    plugins: [
      createAssistantConversationPersistencePlugin({
        store: input.conversationStore,
        authorId: input.assistantAuthorId,
        threadId: input.threadId,
      }),
      createOperationalMemoryConversationPlugin({
        memory,
        consolidateAfterStep: input.consolidateOverflow,
        selectThreadId: () => input.threadId,
      }),
    ],
    observers: [],
  };
}

function selectRunScopedMessages(
  activeMessages: ConversationMessage[],
  historyWindow: {
    historyStartMessageId: string | null;
    historyEndMessageId: string | null;
  },
): ConversationMessage[] {
  if (!historyWindow.historyStartMessageId) {
    return activeMessages;
  }

  if (!historyWindow.historyEndMessageId) {
    const startIndex = activeMessages.findIndex(
      (message) => message.id === historyWindow.historyStartMessageId,
    );

    return startIndex >= 0 ? activeMessages.slice(startIndex) : activeMessages;
  }

  const historyStartIndex = activeMessages.findIndex(
    (message) => message.id === historyWindow.historyStartMessageId,
  );
  const historyEndIndex = activeMessages.findIndex(
    (message) => message.id === historyWindow.historyEndMessageId,
  );

  if (historyStartIndex < 0 || historyEndIndex < historyStartIndex) {
    return activeMessages;
  }

  return [
    ...activeMessages.slice(historyStartIndex, historyEndIndex + 1),
    ...activeMessages.slice(historyEndIndex + 1),
  ];
}
