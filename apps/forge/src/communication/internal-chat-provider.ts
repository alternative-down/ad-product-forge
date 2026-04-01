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
      const sent = await input.internalChat.sendMessage({
        agentId: input.agentId,
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
