import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { agentContacts, type Attachment, type ProviderConversationView, type ProviderMessageView } from '@mastra-engine/core';

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

const storedMessageSchema = z.object({
  messageId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
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

const stateSchema = z.object({
  messages: z.array(storedMessageSchema).default([]),
});

type StoredMessage = z.infer<typeof storedMessageSchema>;

export function createDiscordMessageStore(input: { agentId: string; provider: string }) {
  const statePath = path.resolve('.forge-state', 'providers', input.agentId, `${input.provider}.json`);
  let currentState: z.infer<typeof stateSchema> | null = null;

  async function readState() {
    if (currentState) {
      return currentState;
    }

    try {
      const content = await readFile(statePath, 'utf8');
      currentState = stateSchema.parse(JSON.parse(content));
    } catch {
      currentState = stateSchema.parse({});
    }

    return currentState;
  }

  async function saveState() {
    if (!currentState) {
      return;
    }

    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(currentState, null, 2), 'utf8');
  }

  async function toMessageView(message: StoredMessage) {
    const contact = await agentContacts.findContactByIdentity(input.agentId, input.provider, message.authorId, message.username);
    const conversationId = `${input.provider}:${message.channelId || contact?.slug || message.authorId || message.messageId}`;

    return {
      messageId: message.messageId,
      direction: message.direction,
      provider: input.provider,
      channelId: message.channelId,
      channelName: message.channelName,
      authorId: message.authorId,
      authorName: message.authorName,
      username: message.username,
      content: message.content,
      attachments: message.attachments as Attachment[],
      unread: message.unread,
      createdAt: message.createdAt,
      metadata: message.metadata,
      contactSlug: contact?.slug,
      contactDisplayName: contact?.displayName,
      conversationId,
    } satisfies ProviderMessageView;
  }

  async function saveInboundMessage(rawInput: unknown) {
    const message = storedMessageSchema.omit({ direction: true, unread: true }).parse(rawInput);
    const state = await readState();

    if (state.messages.some((current) => current.messageId === message.messageId)) {
      return;
    }

    state.messages.push({ ...message, direction: 'inbound', unread: true });
    await saveState();
  }

  async function saveOutboundMessage(rawInput: unknown) {
    const message = z.object({
      messageId: z.string(),
      channelId: z.string().optional(),
      channelName: z.string().optional(),
      content: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).parse(rawInput);
    const state = await readState();

    state.messages.push({
      messageId: message.messageId,
      direction: 'outbound',
      channelId: message.channelId,
      channelName: message.channelName,
      content: message.content,
      attachments: [],
      unread: false,
      createdAt: new Date().toISOString(),
      metadata: message.metadata,
    });

    await saveState();
  }

  async function findMessage(messageId: string) {
    const state = await readState();
    return state.messages.find((message) => message.messageId === messageId) ?? null;
  }

  async function listConversations(options: { contactSlug?: string; unread?: boolean; limit: number }) {
    const state = await readState();
    const conversations = new Map<string, ProviderConversationView>();

    for (const message of state.messages) {
      if (options.unread !== undefined && message.unread !== options.unread) {
        continue;
      }

      const view = await toMessageView(message);

      if (options.contactSlug && view.contactSlug !== options.contactSlug) {
        continue;
      }

      const current = conversations.get(view.conversationId) ?? {
        conversationId: view.conversationId,
        provider: input.provider,
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
    const unreadMessageIds = new Set(result.flatMap((conversation) => conversation.messages).filter((message) => message.unread).map((message) => message.messageId));

    if (unreadMessageIds.size > 0) {
      for (const message of state.messages) {
        if (unreadMessageIds.has(message.messageId) && message.unread) {
          message.unread = false;
        }
      }

      await saveState();
    }

    return result;
  }

  async function getMessages(options: { conversationId: string; limit: number }) {
    const state = await readState();
    const result: ProviderMessageView[] = [];

    for (const message of state.messages) {
      const view = await toMessageView(message);

      if (view.conversationId === options.conversationId) {
        result.push(view);
      }
    }

    result.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    const messages = result.slice(-options.limit);
    const unreadMessageIds = new Set(messages.filter((message) => message.unread).map((message) => message.messageId));

    if (unreadMessageIds.size > 0) {
      for (const message of state.messages) {
        if (unreadMessageIds.has(message.messageId) && message.unread) {
          message.unread = false;
        }
      }

      await saveState();
    }

    return messages;
  }

  return { saveInboundMessage, saveOutboundMessage, findMessage, listConversations, getMessages };
}
