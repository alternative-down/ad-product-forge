import crypto from 'node:crypto';

import type { CommunicationProvider } from '../agent/communication/provider-types';

type RegisteredAgent = {
  id: string;
  displayName: string;
  onInbound(message: {
    providerConversationKey: string;
    providerMessageId: string;
    conversationName?: string;
    authorExternalId?: string;
    authorDisplayName?: string;
    authorUsername?: string;
    content: string;
    attachments?: [];
    createdAt: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
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
            onInbound,
            upsertContact,
          });
          await syncContacts();
        },
        async stop() {
          agents.delete(config.id);
        },
        async sendMessage(input) {
          const recipientId = input.providerConversationKey ?? input.contactExternalId;
          const recipient = recipientId ? agents.get(recipientId) : null;

          if (!recipient) {
            throw new Error(`Internal chat target not found: ${recipientId}`);
          }

          const providerMessageId = `internal:${crypto.randomUUID()}`;

          await recipient.onInbound({
            providerConversationKey: config.id,
            providerMessageId,
            conversationName: config.displayName,
            authorExternalId: config.id,
            authorDisplayName: config.displayName,
            authorUsername: config.id,
            content: input.content,
            attachments: [],
            createdAt: new Date().toISOString(),
            metadata: {
              replyToProviderMessageId: input.replyToProviderMessageId,
            },
          });

          return {
            providerConversationKey: config.id,
            providerMessageId,
            conversationName: config.displayName,
          };
        },
      };
    },
  };
}
