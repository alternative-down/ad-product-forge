import type { CommunicationProvider } from '@mastra-engine/core';

import type { InternalChatService } from './internal-chat-service';

export function createInternalChatProvider(input: {
  agentId: string;
  internalChat: InternalChatService;
}): CommunicationProvider {
  return {
    id: 'internal-chat',
    onMessage(callback) {
      input.internalChat.onReceiveMessage(input.agentId, callback);
    },
    async listContacts() {
      const accounts = await input.internalChat.listAccounts({ excludeAgentId: input.agentId });

      return accounts.map((account) => ({
        slug: account.slug,
        displayName: account.displayName,
        description: account.description ?? undefined,
        agentId: account.agentId ?? undefined,
      }));
    },
    async listConversations({ limit, unread }) {
      return input.internalChat.listConversations({
        agentId: input.agentId,
        limit,
        unread,
      });
    },
    async getMessages({ targetKey, limit }) {
      return input.internalChat.getMessages({
        agentId: input.agentId,
        conversationKey: targetKey,
        limit,
      });
    },
    async sendMessage(message) {
      const account = await input.internalChat.getAccountByAgentId(input.agentId);

      if (!account) {
        throw new Error(`Internal chat account not found for agent: ${input.agentId}`);
      }

      const sent = await input.internalChat.sendMessage({
        accountId: account.id,
        targetKey: message.targetKey,
        content: message.content,
        attachments: message.attachments,
      });

      return {
        targetKey: sent.conversationKey,
        messageId: sent.messageId,
      };
    },
  };
}
