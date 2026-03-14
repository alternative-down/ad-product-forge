import { LibSQLStore } from '@mastra/libsql';
import { z } from 'zod';

import { agentContacts } from '../agent/communication/agent-contacts';
import type { ProviderConversationView, ProviderMessageView } from '../agent/communication/provider-types';

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

const payloadSchema = z.object({
  messageId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  provider: z.literal('internal-chat'),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  unread: z.boolean(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type StoredPayload = z.infer<typeof payloadSchema>;

function toStoredContent(payload: StoredPayload) {
  const text = JSON.stringify(payload);

  return {
    format: 2 as const,
    parts: [{ type: 'text' as const, text }],
    content: text,
  };
}

export function createInternalChatMessageStore(input: { agentId: string }) {
  const storage = new LibSQLStore({
    id: `${input.agentId}-internal-chat-store`,
    url: `file:./${input.agentId}.db`,
  });
  const availableMemoryStore = storage.stores.memory;

  if (!availableMemoryStore) {
    throw new Error('Mastra memory store is not available for internal-chat');
  }

  const memoryStore = availableMemoryStore;

  const resourceId = `${input.agentId}:internal-chat`;
  let initialized: Promise<void> | null = null;

  async function ensureReady() {
    if (!initialized) {
      initialized = memoryStore.init();
    }

    await initialized;
  }

  async function ensureThread(threadId: string, title: string) {
    await ensureReady();

    if (await memoryStore.getThreadById({ threadId })) {
      return;
    }

    await memoryStore.saveThread({
      thread: {
        id: threadId,
        resourceId,
        title,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async function readPayloads() {
    await ensureReady();
    const threads = await memoryStore.listThreads({ page: 0, perPage: false });
    const payloads: StoredPayload[] = [];

    for (const thread of threads.threads) {
      if (thread.resourceId !== resourceId) {
        continue;
      }

      const messages = await memoryStore.listMessages({ threadId: thread.id, page: 0, perPage: false });

      for (const message of messages.messages) {
        const content = typeof message.content === 'string' ? message.content : message.content.content;

        if (!content) {
          continue;
        }

        payloads.push(payloadSchema.parse(JSON.parse(content)));
      }
    }

    return payloads;
  }

  async function toMessageView(payload: StoredPayload) {
    const contact = await agentContacts.findContactByIdentity(
      input.agentId,
      'internal-chat',
      payload.authorId,
      payload.username,
    );

    return {
      ...payload,
      contactSlug: contact?.slug,
      contactDisplayName: contact?.displayName,
      conversationId: `internal-chat:${payload.channelId || contact?.slug || payload.authorId || payload.messageId}`,
    } satisfies ProviderMessageView;
  }

  async function saveInboundMessage(rawInput: unknown) {
    const message = payloadSchema.omit({ direction: true, provider: true, unread: true }).parse(rawInput);
    const threadId = `internal-chat:${message.channelId || message.authorId || message.messageId}`;

    await ensureThread(threadId, message.channelName ?? message.channelId ?? 'internal-chat');

    const existing = await memoryStore.listMessagesById({ messageIds: [message.messageId] });

    if (existing.messages.length > 0) {
      return;
    }

    await memoryStore.saveMessages({
      messages: [
        {
          id: message.messageId,
          threadId,
          resourceId,
          role: 'user',
          type: 'text',
          content: toStoredContent({
            ...message,
            direction: 'inbound',
            provider: 'internal-chat',
            unread: true,
          }),
          createdAt: new Date(message.createdAt),
        },
      ],
    });
  }

  async function saveOutboundMessage(rawInput: unknown) {
    const message = z
      .object({
        messageId: z.string(),
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        content: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(rawInput);
    const threadId = `internal-chat:${message.channelId || message.messageId}`;

    await ensureThread(threadId, message.channelName ?? message.channelId ?? 'internal-chat');
    await memoryStore.saveMessages({
      messages: [
        {
          id: message.messageId,
          threadId,
          resourceId,
          role: 'assistant',
          type: 'text',
          content: toStoredContent({
            messageId: message.messageId,
            direction: 'outbound',
            provider: 'internal-chat',
            channelId: message.channelId,
            channelName: message.channelName,
            content: message.content,
            attachments: [],
            unread: false,
            createdAt: new Date().toISOString(),
            metadata: message.metadata,
          }),
          createdAt: new Date(),
        },
      ],
    });
  }

  async function findMessage(messageId: string) {
    return (await readPayloads()).find((message) => message.messageId === messageId) ?? null;
  }

  async function markRead(messageIds: string[]) {
    if (messageIds.length === 0) {
      return;
    }

    const existing = await memoryStore.listMessagesById({ messageIds });
    const updates = existing.messages
      .map((message) => {
        const content = typeof message.content === 'string' ? message.content : message.content.content;

        if (!content) {
          return null;
        }

        const payload = payloadSchema.parse(JSON.parse(content));

        if (!payload.unread) {
          return null;
        }

        return {
          id: message.id,
          content: toStoredContent({
            ...payload,
            unread: false,
          }),
        };
      })
      .filter(
        (
          message,
        ): message is {
          id: string;
          content: {
            format: 2;
            parts: [{ type: 'text'; text: string }];
            content: string;
          };
        } => Boolean(message),
      );

    if (updates.length === 0) {
      return;
    }

    await memoryStore.updateMessages({ messages: updates });
  }

  async function listConversations(options: { contactSlug?: string; unread?: boolean; limit: number }) {
    const payloads = await readPayloads();
    const conversations = new Map<string, ProviderConversationView>();

    for (const payload of payloads) {
      if (options.unread !== undefined && payload.unread !== options.unread) {
        continue;
      }

      const view = await toMessageView(payload);

      if (options.contactSlug && view.contactSlug !== options.contactSlug) {
        continue;
      }

      const current = conversations.get(view.conversationId) ?? {
        conversationId: view.conversationId,
        provider: 'internal-chat',
        channelId: view.channelId,
        channelName: view.channelName,
        contactSlug: view.contactSlug,
        contactDisplayName: view.contactDisplayName,
        latestMessageAt: view.createdAt,
        unreadCount: 0,
        messages: [],
      };

      current.messages.push(view);
      current.latestMessageAt = view.createdAt;

      if (view.unread) {
        current.unreadCount += 1;
      }

      conversations.set(view.conversationId, current);
    }

    const result = Array.from(conversations.values())
      .sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime())
      .slice(0, options.limit)
      .map((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(-5),
      }));

    await markRead(
      result
        .flatMap((conversation) => conversation.messages)
        .filter((message) => message.unread)
        .map((message) => message.messageId),
    );

    return result;
  }

  async function getMessages(options: { conversationId: string; limit: number }) {
    const views: ProviderMessageView[] = [];

    for (const payload of await readPayloads()) {
      const view = await toMessageView(payload);

      if (view.conversationId === options.conversationId) {
        views.push(view);
      }
    }

    views.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    const messages = views.slice(-options.limit);

    await markRead(
      messages.filter((message) => message.unread).map((message) => message.messageId),
    );

    return messages;
  }

  return { saveInboundMessage, saveOutboundMessage, findMessage, listConversations, getMessages };
}
