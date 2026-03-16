import type { CommunicationProvider, CommunicationInboundMessage } from '@mastra-engine/core';

/**
 * Internal chat provider for agent-to-agent communication
 * Routes messages between agents in the same system
 */
export type InternalChatProviderConfig = {
  agentId: string;
};

// Global registry for pending messages (in-memory for now)
const messageQueues = new Map<string, Array<() => Promise<void>>>();

export function createInternalChatProvider(config: InternalChatProviderConfig): CommunicationProvider {
  let messageCallback: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;

  return {
    id: 'internal-chat',
    async getAccount() {
      return {
        externalAccountId: config.agentId,
        displayName: `${config.agentId} (internal)`,
      };
    },
    async onMessage(callback) {
      messageCallback = callback;

      // When registered, process any pending messages for this agent
      const pendingCallbacks = messageQueues.get(config.agentId) || [];
      for (const cb of pendingCallbacks) {
        await cb();
      }
      messageQueues.delete(config.agentId);
    },
    async sendMessage(input) {
      // Queue message for recipient agent
      const recipientAgentId = input.contactExternalId || 'unknown';
      const conversationKey = input.providerConversationKey || `internal-${config.agentId}-to-${recipientAgentId}-${Date.now()}`;

      // Store message for delivery
      const inboundMessage: CommunicationInboundMessage = {
        providerConversationKey: conversationKey,
        providerMessageId: `internal-msg-${Date.now()}`,
        conversationName: `Internal chat: ${config.agentId}`,
        authorExternalId: config.agentId,
        authorDisplayName: config.agentId,
        content: input.content,
        createdAt: new Date().toISOString(),
      };

      // If recipient has a message callback, deliver immediately
      // Otherwise, queue for later delivery
      const callbacks = messageQueues.get(recipientAgentId) || [];
      callbacks.push(async () => {
        if (messageCallback) {
          await messageCallback(inboundMessage);
        }
      });
      messageQueues.set(recipientAgentId, callbacks);

      return {
        providerConversationKey: conversationKey,
        providerMessageId: inboundMessage.providerMessageId,
        conversationName: inboundMessage.conversationName,
      };
    },
  };
}
