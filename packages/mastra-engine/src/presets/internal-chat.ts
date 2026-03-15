import crypto from 'node:crypto';

import type { CommunicationProvider } from '../agent/communication/provider-types';

type RegisteredAgent = {
  id: string;
  displayName: string;
  onMessage(message: {
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
};

export function createInternalChatPreset() {
  const agents = new Map<string, RegisteredAgent>();

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
        async onMessage(callback) {
          agents.set(config.id, {
            id: config.id,
            displayName: config.displayName,
            onMessage: callback,
          });
        },
        async syncContacts() {
          return Array.from(agents.values())
            .filter((agent) => agent.id !== config.id)
            .map((agent) => ({
              slug: agent.id,
              displayName: agent.displayName,
              externalUserId: agent.id,
              username: agent.id,
            }));
        },
        async sendMessage(input) {
          const recipientId = input.providerConversationKey ?? input.contactExternalId;
          const recipient = recipientId ? agents.get(recipientId) : null;

          if (!recipient) {
            throw new Error(`Internal chat target not found: ${recipientId}`);
          }

          const providerMessageId = `internal:${crypto.randomUUID()}`;

          await recipient.onMessage({
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
