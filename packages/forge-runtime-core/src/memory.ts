import {
  CheckpointedConversationMemory,
  createCheckpointedConversationPlugin,
  type CheckpointedConversationObserver,
  type CheckpointedConversationStateStore,
  type ConversationStore,
  type RuntimeObserver,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { createAssistantConversationPersistencePlugin } from './assistant-conversation-persistence-plugin.js';

export type ForgeConversationMemoryOptions = {
  threadId: string;
  conversationStore: ConversationStore;
  stateStore: CheckpointedConversationStateStore;
  assistantAuthorId?: string;
  observer?: CheckpointedConversationObserver;
  recentMessageLimit?: number;
  recentTokenLimit?: number;
  observationTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  consolidateOverflow?: boolean;
};

export function createForgeConversationMemory(input: ForgeConversationMemoryOptions): {
  memory: CheckpointedConversationMemory;
  plugins: RuntimePlugin[];
  observers: RuntimeObserver[];
} {
  const memory = new CheckpointedConversationMemory({
    threadId: input.threadId,
    store: input.conversationStore,
    stateStore: input.stateStore,
    observer: input.observer,
    recentMessageLimit: input.recentMessageLimit,
    recentTokenLimit: input.recentTokenLimit,
    observationTokenLimit: input.observationTokenLimit,
    overflowObservationTokenLimit: input.overflowObservationTokenLimit,
  });

  return {
    memory,
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
