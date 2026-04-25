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

  async updateMessage(input: {
    threadId: string;
    messageId: string;
    role?: ConversationMessage['role'];
    parts?: ConversationMessage['parts'];
    metadata?: Record<string, unknown> | undefined;
    operationalMemoryType?: ConversationMessage['operationalMemoryType'];
    operationalMemoryGeneration?: number | null | undefined;
  }): Promise<void> {
    const currentMessages = this.messagesByThread.get(input.threadId) ?? [];
    const messageIndex = currentMessages.findIndex((message) => message.id === input.messageId);

    if (messageIndex < 0) {
      return;
    }

    const currentMessage = currentMessages[messageIndex];

    currentMessages[messageIndex] = {
      ...currentMessage,
      ...(input.role ? { role: input.role } : {}),
      ...(input.parts ? { parts: input.parts } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.operationalMemoryType !== undefined
        ? { operationalMemoryType: input.operationalMemoryType }
        : {}),
      ...(input.operationalMemoryGeneration !== undefined
        ? { operationalMemoryGeneration: input.operationalMemoryGeneration }
        : {}),
    };
    this.messagesByThread.set(input.threadId, currentMessages);
  }

  async updateMessageMetadata(input: {
    threadId: string;
    messageId: string;
    metadata: Record<string, unknown> | undefined;
  }): Promise<void> {
    const currentMessages = this.messagesByThread.get(input.threadId) ?? [];
    const messageIndex = currentMessages.findIndex((message) => message.id === input.messageId);

    if (messageIndex < 0) {
      return;
    }

    const currentMessage = currentMessages[messageIndex];

    currentMessages[messageIndex] = {
      ...currentMessage,
      metadata: input.metadata,
    };
    this.messagesByThread.set(input.threadId, currentMessages);
  }

  async updateMessageReplacement(input: {
    threadId: string;
    messageId: string;
    replacedByMessageId: string | null;
  }): Promise<void> {
    const currentMessages = this.messagesByThread.get(input.threadId) ?? [];
    const messageIndex = currentMessages.findIndex((message) => message.id === input.messageId);

    if (messageIndex < 0) {
      return;
    }

    const currentMessage = currentMessages[messageIndex];

    currentMessages[messageIndex] = {
      ...currentMessage,
      replacedByMessageId: input.replacedByMessageId,
    };
    this.messagesByThread.set(input.threadId, currentMessages);
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
      return query.order === 'desc' ? [...selectedMessages].reverse() : [...selectedMessages];
    }

    if (query.order === 'desc') {
      return [...selectedMessages].reverse().slice(0, query.limit);
    }

    return selectedMessages.slice(-query.limit);
  }

  async listOperationalMemoryMessages(input: {
    threadId: string;
  }): Promise<ConversationMessage[]> {
    const threadMessages = this.messagesByThread.get(input.threadId) ?? [];
    const checkpointIndex = findOperationalMemoryCheckpointIndex(threadMessages);
    const seedMessages = checkpointIndex >= 0 ? threadMessages.slice(checkpointIndex) : [...threadMessages];
    const messageMap = new Map(threadMessages.map((message) => [message.id, message]));
    const visibleMessages: ConversationMessage[] = [];
    const seenTerminalIds = new Set<string>();

    for (const seedMessage of seedMessages) {
      const terminalMessage = resolveTerminalOperationalMemoryMessage(seedMessage, messageMap);

      if (!terminalMessage || seenTerminalIds.has(terminalMessage.id)) {
        continue;
      }

      seenTerminalIds.add(terminalMessage.id);
      visibleMessages.push(terminalMessage);
    }

    return visibleMessages;
  }
}

function findOperationalMemoryCheckpointIndex(messages: ConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.operationalMemoryType === 'checkpoint-summary' && !message.replacedByMessageId) {
      return index;
    }
  }

  return -1;
}

function resolveTerminalOperationalMemoryMessage(
  message: ConversationMessage,
  messageMap: Map<string, ConversationMessage>,
) {
  let currentMessage: ConversationMessage | undefined = message;
  const visitedIds = new Set<string>();

  while (currentMessage?.replacedByMessageId) {
    if (visitedIds.has(currentMessage.id)) {
      return currentMessage;
    }

    visitedIds.add(currentMessage.id);
    currentMessage = messageMap.get(currentMessage.replacedByMessageId);
  }

  return currentMessage ?? null;
}
