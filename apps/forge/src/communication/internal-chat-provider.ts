import {
  forgeDebug,
  type CommunicationInboundMessage,
  type CommunicationProvider,
  type CommunicationProviderConversation,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';

import type { InternalChatService } from './internal-chat-service';
import type { ConversationListingOutput } from './internal-chat-conversations-listing';

import {
  InternalChatAccountNotFoundError,
  InternalChatDispatchFailedError,
} from './internal-chat-provider.errors';

// Map InternalChatService.listConversations output to the shared
// CommunicationProviderConversation shape.
function mapListingOutputToProviderConversation(
  output: ConversationListingOutput,
): CommunicationProviderConversation {
  return {
    targetKey: output.targetKey,
    provider: output.provider,
    latestMessageAt: output.latestMessageAt,
    unreadCount: output.unreadCount,
    name: output.name,
    participants: output.participants,
    messages: output.messages as CommunicationProviderMessage[],
  };
}

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

      if (account === null || account === undefined) {
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

      return accounts.map((account) => ({
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
      const listings = await input.internalChat.listConversations({
        agentId: input.agentId,
        limit,
        unread,
      });
      return listings.map(mapListingOutputToProviderConversation);
    },
    async getMessages({ targetKey, limit, offset, query, dateFrom, dateTo }) {
      return (await input.internalChat.getMessages({
        agentId: input.agentId,
        conversationKey: targetKey,
        limit,
        offset,
        query,
        dateFrom,
        dateTo,
      })) as CommunicationProviderMessage[];
    },
    async sendMessage(message) {
      const account = await input.internalChat.getAccountByAgentId(input.agentId);

      if (account === null || account === undefined) {
        forgeDebug({
          scope: 'internal-chat-provider',
          level: 'warn',
          message: 'resolveAccount: internal chat account not found',
          context: { agentId: input.agentId },
        });
        throw new InternalChatAccountNotFoundError(input.agentId);
      }

      const sent = await input.internalChat.sendMessage({
        accountId: account.id,
        targetKey: message.targetKey,
        content: message.content,
        attachments: message.attachments,
      });
      if (sent.valid === false) {
        throw new InternalChatDispatchFailedError(sent.error);
      }

      return {
        targetKey: sent.data.conversationKey,
        messageId: sent.data.messageId,
      };
    },
  };
}
