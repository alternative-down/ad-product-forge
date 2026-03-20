import crypto from 'node:crypto';

import type { CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

type RegisteredAgent = {
  id: string;
  displayName: string;
  description?: string;
  onMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null;
};

export function createInternalChatPreset() {
  const agents = new Map<string, RegisteredAgent>();

  return {
    createProvider(config: { id: string; displayName: string; description?: string }): CommunicationProvider {
      const agent: RegisteredAgent = {
        id: config.id,
        displayName: config.displayName,
        description: config.description,
        onMessage: null,
      };

      agents.set(config.id, agent);

      return {
        id: 'internal-chat',
        async getAccount() {
          return {
            externalAccountId: config.id,
            displayName: config.displayName,
          };
        },
        onMessage(callback) {
          agent.onMessage = callback;
        },
        async syncContacts() {
          return Array.from(agents.values())
            .filter((currentAgent) => currentAgent.id !== config.id)
            .map((currentAgent) => ({
              slug: currentAgent.id,
              displayName: currentAgent.displayName,
              description: currentAgent.description,
              externalUserId: currentAgent.id,
              username: currentAgent.id,
            }));
        },
        async sendMessage(input) {
          const recipientId = input.providerConversationKey ?? input.contactExternalId;
          const recipient = recipientId ? agents.get(recipientId) : null;

          if (!recipient) {
            throw new Error(`Internal chat target not found: ${recipientId}`);
          }

          if (!recipient.onMessage) {
            throw new Error(`Internal chat target is not listening: ${recipientId}`);
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
