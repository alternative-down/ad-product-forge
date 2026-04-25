import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ConversationMessage,
  ConversationMessageListQuery,
  ConversationStore,
  ConversationThread,
} from './contracts.js';

type ConversationStoreFile = {
  threads: ConversationThread[];
  messages: SerializedConversationMessage[];
};

type SerializedConversationMessage = Omit<ConversationMessage, 'parts'> & {
  parts: Array<
    | {
      type: 'text';
      text: string;
    }
    | {
      type: 'reasoning';
      text: string;
      providerMetadata?: {
        anthropic?: {
          signature?: string;
          redactedData?: string;
        };
      };
    }
    | {
      type: 'image';
      mimeType: string;
      bytesBase64: string;
    }
    | {
      type: 'file';
      mimeType: string;
      name: string;
      bytesBase64: string;
    }
  >;
};

export type FilesystemConversationStoreOptions = {
  filePath: string;
};

export class FilesystemConversationStore implements ConversationStore {
  private readonly filePath: string;

  constructor(options: FilesystemConversationStoreOptions) {
    this.filePath = options.filePath;
  }

  async upsertThread(thread: ConversationThread): Promise<void> {
    const storeFile = await this.readStoreFile();
    const nextThreads = storeFile.threads.filter((currentThread) => currentThread.id !== thread.id);

    nextThreads.push(thread);
    await this.writeStoreFile({
      ...storeFile,
      threads: nextThreads,
    });
  }

  async getThread(threadId: string): Promise<ConversationThread | null> {
    const storeFile = await this.readStoreFile();

    return storeFile.threads.find((thread) => thread.id === threadId) ?? null;
  }

  async listThreads(): Promise<ConversationThread[]> {
    const storeFile = await this.readStoreFile();

    return storeFile.threads.sort((left, right) => {
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async appendMessage(message: ConversationMessage): Promise<void> {
    const storeFile = await this.readStoreFile();

    storeFile.messages.push(serializeMessage(message));
    await this.writeStoreFile(storeFile);
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
    const storeFile = await this.readStoreFile();
    const messageIndex = storeFile.messages.findIndex((message) =>
      message.threadId === input.threadId && message.id === input.messageId);

    if (messageIndex < 0) {
      return;
    }

    const currentMessage = storeFile.messages[messageIndex];
    const nextMessage: ConversationMessage = {
      ...deserializeMessage(currentMessage),
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

    storeFile.messages[messageIndex] = serializeMessage(nextMessage);
    await this.writeStoreFile(storeFile);
  }

  async updateMessageMetadata(input: {
    threadId: string;
    messageId: string;
    metadata: Record<string, unknown> | undefined;
  }): Promise<void> {
    const storeFile = await this.readStoreFile();
    const messageIndex = storeFile.messages.findIndex((message) =>
      message.threadId === input.threadId && message.id === input.messageId);

    if (messageIndex < 0) {
      return;
    }

    storeFile.messages[messageIndex] = {
      ...storeFile.messages[messageIndex],
      metadata: input.metadata,
    };
    await this.writeStoreFile(storeFile);
  }

  async updateMessageReplacement(input: {
    threadId: string;
    messageId: string;
    replacedByMessageId: string | null;
  }): Promise<void> {
    const storeFile = await this.readStoreFile();
    const messageIndex = storeFile.messages.findIndex((message) =>
      message.threadId === input.threadId && message.id === input.messageId);

    if (messageIndex < 0) {
      return;
    }

    storeFile.messages[messageIndex] = {
      ...storeFile.messages[messageIndex],
      replacedByMessageId: input.replacedByMessageId,
    };
    await this.writeStoreFile(storeFile);
  }

  async listMessages(query: ConversationMessageListQuery): Promise<ConversationMessage[]> {
    const storeFile = await this.readStoreFile();
    const threadMessages = storeFile.messages
      .filter((message) => message.threadId === query.threadId)
      .map(deserializeMessage);
    const startIndex = query.afterMessageId
      ? threadMessages.findIndex((message) => message.id === query.afterMessageId) + 1
      : 0;
    const beforeIndex = query.beforeMessageId
      ? threadMessages.findIndex((message) => message.id === query.beforeMessageId)
      : -1;
    const endIndex = beforeIndex >= 0 ? beforeIndex : threadMessages.length;
    const selectedMessages = threadMessages.slice(Math.max(0, startIndex), endIndex);

    if (!query.limit || query.limit <= 0) {
      return query.order === 'desc' ? [...selectedMessages].reverse() : selectedMessages;
    }

    if (query.order === 'desc') {
      return [...selectedMessages].reverse().slice(0, query.limit);
    }

    return selectedMessages.slice(-query.limit);
  }

  async listOperationalMemoryMessages(input: {
    threadId: string;
  }): Promise<ConversationMessage[]> {
    const storeFile = await this.readStoreFile();
    const threadMessages = storeFile.messages
      .filter((message) => message.threadId === input.threadId)
      .map(deserializeMessage);
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

  private async readStoreFile(): Promise<ConversationStoreFile> {
    const rawContent = await readFile(this.filePath, 'utf8').catch(() => null);

    if (!rawContent) {
      return {
        threads: [],
        messages: [],
      };
    }

    return JSON.parse(rawContent) as ConversationStoreFile;
  }

  private async writeStoreFile(storeFile: ConversationStoreFile) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(storeFile, null, 2));
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

function serializeMessage(message: ConversationMessage): SerializedConversationMessage {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === 'text' || part.type === 'reasoning') {
        return part;
      }

      if (part.type === 'image') {
        return {
          type: 'image',
          mimeType: part.mimeType,
          bytesBase64: Buffer.from(part.bytes).toString('base64'),
        };
      }

      return {
        type: 'file',
        mimeType: part.mimeType,
        name: part.name,
        bytesBase64: Buffer.from(part.bytes).toString('base64'),
      };
    }),
  };
}

function deserializeMessage(message: SerializedConversationMessage): ConversationMessage {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === 'text' || part.type === 'reasoning') {
        return part;
      }

      if (part.type === 'image') {
        return {
          type: 'image',
          mimeType: part.mimeType,
          bytes: Uint8Array.from(Buffer.from(part.bytesBase64, 'base64')),
        };
      }

      return {
        type: 'file',
        mimeType: part.mimeType,
        name: part.name,
        bytes: Uint8Array.from(Buffer.from(part.bytesBase64, 'base64')),
      };
    }),
  };
}
