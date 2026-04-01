import type { CommunicationProvider } from '@mastra-engine/core';

import type { InternalChatService } from './internal-chat-service';

export function createInternalChatProvider(input: {
  agentId: string;
  internalChat: InternalChatService;
}): CommunicationProvider {
  async function resolveTargetKey(targetKey: string) {
    const account = await input.internalChat.getAccountByAgentId(targetKey);

    if (!account) {
      return targetKey;
    }

    return `internal-chat:${account.slug}`;
  }

  return {
    id: 'internal-chat',
    onMessage(callback) {
      input.internalChat.onReceiveMessage(input.agentId, callback);
    },
    async listConversations({ limit, unread }) {
      return input.internalChat.listConversations({
        agentId: input.agentId,
        limit,
        unread,
      });
    },
    async getMessages({ targetKey, limit }) {
      const resolvedTargetKey = await resolveTargetKey(targetKey);

      return input.internalChat.getMessages({
        agentId: input.agentId,
        conversationKey: resolvedTargetKey,
        limit,
      });
    },
    async sendMessage(message) {
      const conversationKey = await resolveTargetKey(message.targetKey);

      const sent = await input.internalChat.sendMessage({
        agentId: input.agentId,
        conversationKey,
        content: message.content,
      });

      return {
        targetKey: sent.conversationKey,
        messageId: sent.messageId,
      };
    },
  };
}
