import type {
  CommunicationInboundMessage,
  CommunicationProvider,
} from '@forge-runtime/core';

import type { TicketingService } from './service';

export function createTicketingProvider(input: {
  agentId: string;
  ticketing: TicketingService;
}): CommunicationProvider {
  return {
    id: 'ticketing',
    onMessage(callback) {
      input.ticketing.onMessage(async (message: CommunicationInboundMessage) => {
        // Only handle messages for this agent
        if (message.targetKey) {
          await callback(message);
        }
      });
    },
    dispose() {
      input.ticketing.clearHandler();
    },
    async getSelfContact() {
      return {
        targetKey: `ticketing-agent:${input.agentId}`,
        slug: `ticketing-agent:${input.agentId}`,
        displayName: `Ticketing Agent (${input.agentId})`,
      };
    },
    async listContacts() {
      return [];
    },
    async listConversations({ limit }) {
      return input.ticketing.listTickets({ agentId: input.agentId, limit });
    },
    async getMessages({ targetKey, limit, offset }) {
      return input.ticketing.getMessages({ targetKey, limit, offset });
    },
    async sendMessage(message) {
      const result = await input.ticketing.sendAgentReply({
        ticketId: message.targetKey,
        agentId: input.agentId,
        content: message.content,
      });
      return { messageId: result.messageId, targetKey: message.targetKey };
    },
  };
}
