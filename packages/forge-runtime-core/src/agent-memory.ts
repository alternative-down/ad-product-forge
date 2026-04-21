import {
  FilesystemConversationStore,
  InMemoryConversationStore,
  createConversationHistoryPlugin,
  type ConversationStore,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

export type AgentMemory = {
  conversationStore: ConversationStore;
  createHistoryPlugin(input?: {
    maxMessages?: number;
    name?: string;
  }): RuntimePlugin;
};

export function createAgentMemory(input: {
  filePath?: string;
  store?: ConversationStore;
} = {}): AgentMemory {
  const conversationStore = input.store ?? (
    input.filePath
      ? new FilesystemConversationStore({ filePath: input.filePath })
      : new InMemoryConversationStore()
  );

  return {
    conversationStore,
    createHistoryPlugin(options = {}) {
      return createConversationHistoryPlugin({
        store: conversationStore,
        maxMessages: options.maxMessages,
        name: options.name,
      });
    },
  };
}
