import crypto from 'node:crypto';

import type { CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

type RegisteredAgent = {
  id: string;
  slug: string;
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
        slug: createInternalChatSlug(config.displayName, config.id),
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
              slug: currentAgent.slug,
              displayName: currentAgent.displayName,
              description: currentAgent.description,
              externalUserId: currentAgent.id,
              username: currentAgent.slug,
            }));
        },
        async sendMessage(input) {
          const recipientId = input.contactExternalId ?? input.providerConversationKey;
          const recipient = recipientId ? agents.get(recipientId) : null;

          if (!recipient) {
            throw new Error(`Internal chat target not found: ${recipientId}`);
          }

          if (!recipient.onMessage) {
            throw new Error(`Internal chat target is not listening: ${recipientId}`);
          }

          const providerMessageId = `internal:${crypto.randomUUID()}`;
          const isGroupConversation = input.conversationType === 'group';

          await recipient.onMessage({
            providerConversationKey: isGroupConversation
              ? (input.providerConversationKey ?? config.id)
              : config.id,
            providerMessageId,
            conversationName: isGroupConversation
              ? (input.conversationName ?? config.displayName)
              : config.displayName,
            authorExternalId: config.id,
            authorDisplayName: config.displayName,
            authorUsername: agent.slug,
            content: input.content,
            attachments: [],
            createdAt: new Date().toISOString(),
            metadata: {
              replyToProviderMessageId: input.replyToProviderMessageId,
            },
          });

          return {
            providerConversationKey: input.providerConversationKey ?? recipient.id,
            providerMessageId,
            conversationName: input.conversationName ?? recipient.displayName,
          };
        },
      };
    },
  };
}

function createInternalChatSlug(displayName: string, agentId: string) {
  const baseSlug = displayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'agent';

  return `${baseSlug}-${agentId.slice(0, 6).toLowerCase()}`;
}
