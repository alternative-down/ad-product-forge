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
    createProvider(config: {
      id: string;
      displayName: string;
      description?: string;
      getGroupMembers?: (groupId: string) => Promise<{ id: string; displayName: string }[]>;
    }): CommunicationProvider {
      const agent: RegisteredAgent = {
        id: config.id,
        slug: createInternalChatSlug(config.displayName, config.id),
        displayName: config.displayName,
        description: config.description,
        onMessage: null,
      };

      agents.set(config.id, agent);

      const getGroupMembers = config.getGroupMembers;

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
          const isGroupConversation = input.conversationType === 'group';
          const recipientId = input.contactExternalId ?? input.providerConversationKey;

          // Handle group conversations
          if (isGroupConversation) {
            if (!getGroupMembers) {
              throw new Error(`Group messaging requires getGroupMembers to be configured for agent ${config.id}`);
            }

            const groupId = recipientId;
            if (!groupId) {
              throw new Error('Group conversation requires a group ID');
            }
            const groupMembers = await getGroupMembers(groupId);
            const providerMessageId = `internal:${crypto.randomUUID()}`;
            const timestamp = new Date().toISOString();

            // Deliver message to each group member
            const deliveryPromises = groupMembers.map(async (member) => {
              const memberAgent = agents.get(member.id);
              
              if (!memberAgent) {
                // Agent not registered in this instance, skip silently
                return;
              }

              if (!memberAgent.onMessage) {
                // Agent not listening, skip silently
                return;
              }

              await memberAgent.onMessage({
                providerConversationKey: groupId!,
                providerMessageId,
                conversationName: input.conversationName ?? config.displayName,
                authorExternalId: config.id,
                authorDisplayName: config.displayName,
                authorUsername: agent.slug,
                content: input.content,
                attachments: [],
                createdAt: timestamp,
                metadata: {
                  replyToProviderMessageId: input.replyToProviderMessageId,
                  groupDelivery: true,
                },
              });
            });

            await Promise.allSettled(deliveryPromises);

            return {
              providerConversationKey: groupId!,
              providerMessageId,
              conversationName: input.conversationName ?? config.displayName,
            };
          }

          // Handle direct messages (existing logic)
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
