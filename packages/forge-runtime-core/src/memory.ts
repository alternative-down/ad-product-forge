import {
  CheckpointedConversationMemory,
  createCheckpointedConversationPlugin,
  createConversationRuntimeObserver,
  type CheckpointedConversationObserver,
  type CheckpointedConversationStateStore,
  type ConversationStore,
  type RuntimeObserver,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

export type ForgeConversationMemoryOptions = {
  threadId: string;
  conversationStore: ConversationStore;
  stateStore: CheckpointedConversationStateStore;
  assistantAuthorId?: string;
  observer?: CheckpointedConversationObserver;
  recentMessageLimit?: number;
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
  });

  return {
    memory,
    plugins: [
      createCheckpointedConversationPlugin({
        memory,
        consolidateAfterStep: input.consolidateOverflow,
        selectThreadId() {
          return input.threadId;
        },
      }),
    ],
    observers: [
      createConversationRuntimeObserver({
        store: input.conversationStore,
        authorId: input.assistantAuthorId,
        threadId: input.threadId,
      }),
    ],
  };
}
