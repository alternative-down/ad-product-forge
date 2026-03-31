import type { CommunicationProvider } from '@mastra-engine/core';

import type { InternalChatService } from './internal-chat-service';

export function createInternalChatProvider(input: {
  agentId: string;
  displayName: string;
  description?: string;
  internalChat: InternalChatService;
}): CommunicationProvider {
  return {
    id: 'internal-chat',
    async getAccount() {
      const account = await input.internalChat.registerAgentAccount({
        agentId: input.agentId,
        displayName: input.displayName,
        description: input.description,
      });

      return {
        externalAccountId: account.agentId,
        displayName: account.displayName,
        metadata: {
          slug: account.slug,
        },
      };
    },
    onMessage(callback) {
      input.internalChat.onReceiveMessage(input.agentId, callback);
    },
    async syncContacts() {
      const accounts = await input.internalChat.listAccounts({
        excludeAgentId: input.agentId,
      });

      return accounts.map((account) => ({
        slug: account.slug,
        displayName: account.displayName,
        externalUserId: account.agentId,
        username: account.slug,
      }));
    },
    async sendMessage(message) {
      let conversationKey = message.providerConversationKey;

      if (!conversationKey && message.contactExternalId) {
        const account = await input.internalChat.getAccountByAgentId(message.contactExternalId);

        if (!account) {
          throw new Error(`Internal chat target not found: ${message.contactExternalId}`);
        }

        conversationKey = `internal-chat:${account.slug}`;
      }

      if (!conversationKey) {
        throw new Error('Internal chat requires a conversation or recipient');
      }

      const sent = await input.internalChat.sendMessage({
        agentId: input.agentId,
        conversationKey,
        content: message.content,
        replyToMessageId: message.replyToProviderMessageId,
      });

      return {
        providerConversationKey: sent.conversationKey,
        providerMessageId: sent.messageId,
        conversationName: message.conversationName,
      };
    },
  };
}
