import type {
  ConversationMessage,
  ConversationMessageListQuery,
  ConversationStore,
  ConversationThread,
} from './contracts.js';

export class InMemoryConversationStore implements ConversationStore {
  private readonly threads = new Map<string, ConversationThread>();
  private readonly messagesByThread = new Map<string, ConversationMessage[]>();

  async upsertThread(thread: ConversationThread): Promise<void> {
    this.threads.set(thread.id, thread);
  }

  async getThread(threadId: string): Promise<ConversationThread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async listThreads(): Promise<ConversationThread[]> {
    return Array.from(this.threads.values()).sort((left, right) => {
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async appendMessage(message: ConversationMessage): Promise<void> {
    const currentMessages = this.messagesByThread.get(message.threadId) ?? [];

    currentMessages.push(message);
    this.messagesByThread.set(message.threadId, currentMessages);
  }

  async listMessages(query: ConversationMessageListQuery): Promise<ConversationMessage[]> {
    const currentMessages = this.messagesByThread.get(query.threadId) ?? [];
    const startIndex = query.afterMessageId
      ? currentMessages.findIndex((message) => message.id === query.afterMessageId) + 1
      : 0;
    const beforeIndex = query.beforeMessageId
      ? currentMessages.findIndex((message) => message.id === query.beforeMessageId)
      : -1;
    const endIndex = beforeIndex >= 0 ? beforeIndex : currentMessages.length;
    const selectedMessages = currentMessages.slice(Math.max(0, startIndex), endIndex);

    if (!query.limit || query.limit <= 0) {
      return [...selectedMessages];
    }

    return selectedMessages.slice(-query.limit);
  }
}
