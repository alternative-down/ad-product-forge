import type { ModelMessage } from 'ai';

import {
  CheckpointedConversationMemory,
  createCheckpointedConversationPlugin,
  type CheckpointedConversationObserver,
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
  renderModelMessages(): Promise<ModelMessage[]>;
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
    async renderModelMessages() {
      const activeMessages = await input.conversationStore.listOperationalMemoryMessages({
        threadId: input.threadId,
      });

      return [
        {
          role: 'user',
          content: [{
            type: 'text' as const,
            text: AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT,
          }],
        } as ModelMessage,
        ...createConversationModelMessages(activeMessages),
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
