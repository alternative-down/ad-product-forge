import crypto from 'node:crypto';

import { createInternalChatMessageStore } from './internal-chat-message-store';
import type { CommunicationProvider } from '../agent/communication/module';

type RegisteredAgent = {
  id: string;
  displayName: string;
  messages: ReturnType<typeof createInternalChatMessageStore>;
  onInbound(input: { authorId?: string; authorName?: string; username?: string }): Promise<void>;
  upsertContact(input: {
    slug: string;
    displayName: string;
    provider: string;
    externalUserId?: string;
    username?: string;
  }): Promise<void>;
};

export function createInternalChatPreset() {
  const agents = new Map<string, RegisteredAgent>();

  async function syncContacts() {
    for (const source of agents.values()) {
      for (const target of agents.values()) {
        if (source.id === target.id) {
          continue;
        }

        await source.upsertContact({
          slug: target.id,
          displayName: target.displayName,
          provider: 'internal-chat',
          externalUserId: target.id,
          username: target.id,
        });
      }
    }
  }

  return {
    createProvider(config: { id: string; displayName: string }): CommunicationProvider {
      const messages = createInternalChatMessageStore({ agentId: config.id });

      return {
        id: 'internal-chat',
        async getAccount() {
          return {
            externalAccountId: config.id,
            displayName: config.displayName,
          };
        },
        async start({ onInbound, upsertContact }) {
          agents.set(config.id, {
            id: config.id,
            displayName: config.displayName,
            messages,
            onInbound,
            upsertContact,
          });
          await syncContacts();
        },
        async stop() {
          agents.delete(config.id);
        },
        listConversations: ({ contactSlug, unread, limit }) =>
          messages.listConversations({
            contactSlug,
            unread,
            limit,
          }),
        getMessages: ({ conversationId, limit }) =>
          messages.getMessages({
            conversationId,
            limit,
          }),
        findMessage: (messageId) => messages.findMessage(messageId),
        async sendMessage(input) {
          const recipient = agents.get(input.target);

          if (!recipient) {
            throw new Error(`Internal chat target not found: ${input.target}`);
          }

          const messageId = `internal:${crypto.randomUUID()}`;

          await recipient.messages.saveInboundMessage({
            messageId,
            channelId: config.id,
            channelName: config.displayName,
            authorId: config.id,
            authorName: config.displayName,
            username: config.id,
            content: input.content,
            attachments: [],
            createdAt: new Date().toISOString(),
            metadata: {
              provider: 'internal-chat',
              replyToMessageId: input.replyToMessageId,
            },
          });

          await recipient.onInbound({
            authorId: config.id,
            authorName: config.displayName,
            username: config.id,
          });

          await messages.saveOutboundMessage({
            messageId,
            channelId: config.id,
            channelName: config.displayName,
            content: input.content,
            metadata: {
              contactSlug: input.contactSlug,
              replyToMessageId: input.replyToMessageId,
            },
          });

          return {
            messageId,
            channelId: config.id,
          };
        },
      };
    },
  };
}
