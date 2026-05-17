import { forgeDebug, type CommunicationInboundMessage, type CommunicationProvider } from '@forge-runtime/core';

import type { InternalChatService } from './internal-chat-service';

export function createInternalChatProvider(input: {
  agentId: string;
  internalChat: InternalChatService;
}): CommunicationProvider {
  let currentHandler: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;

  return {
    id: 'internal-chat',
    onMessage(callback) {
      currentHandler = callback;
      input.internalChat.onReceiveMessage(input.agentId, callback);
    },
    dispose() {
      input.internalChat.clearHandler(input.agentId, currentHandler ?? undefined);
      currentHandler = null;
    },
    async getSelfContact() {
      const account = await input.internalChat.getAccountByAgentId(input.agentId);

      if (!account) {
        return null;
      }

      return {
        targetKey: account.agentId ?? account.slug,
        slug: account.slug,
        displayName: account.displayName,
        description: account.description ?? undefined,
        metadata: {
          slug: account.slug,
        },
      };
    },
    async listContacts() {
      const accounts = await input.internalChat.listAccounts({ excludeAgentId: input.agentId });

      return accounts.map((account: any) => ({
        targetKey: account.agentId ?? account.slug,
        slug: account.slug,
        displayName: account.displayName,
        description: account.description ?? undefined,
        metadata: {
          slug: account.slug,
        },
      }));
    },
    async listConversations({ limit, unread }) {
      return await input.internalChat.listConversations({
        agentId: input.agentId,
        limit,
        unread,
      });
    },
    async getMessages({ targetKey, limit, offset, query, dateFrom, dateTo }) {
      return await input.internalChat.getMessages({
        agentId: input.agentId,
        conversationKey: targetKey,
        limit,
        offset,
        query,
        dateFrom,
        dateTo,
      });
    },
    async sendMessage(message) {
      const account = await input.internalChat.getAccountByAgentId(input.agentId);

      if (!account) {
        forgeDebug({ scope: 'internal-chat-provider', level: 'warn', message: 'resolveAccount: internal chat account not found', context: { agentId: input.agentId } });
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
