import crypto from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

import { agentAccounts } from '../agent/communication/agent-accounts';
import { agentContacts } from '../agent/communication/agent-contacts';
import { communicationModule } from '../agent/communication/module';
import type { AgentWakeQueue } from '../agent/wake-queue';
import { createProviderMessageStore } from './provider-message-store';

type RegisteredAgent = {
  agentId: string;
  accountId: string;
  displayName: string;
  wakeQueue: AgentWakeQueue;
  messages: ReturnType<typeof createProviderMessageStore>;
};

export function createInternalChatRouter() {
  const agents = new Map<string, RegisteredAgent>();

  async function syncAgentContacts() {
    for (const sourceAgent of agents.values()) {
      for (const targetAgent of agents.values()) {
        if (sourceAgent.agentId === targetAgent.agentId) {
          continue;
        }

        await agentContacts.upsertAgentContact({
          agentId: sourceAgent.agentId,
          slug: targetAgent.agentId,
          displayName: targetAgent.displayName,
          accounts: [
            {
              provider: 'internal-chat',
              externalUserId: targetAgent.agentId,
              username: targetAgent.agentId,
            },
          ],
        });
      }
    }
  }

  async function registerAgent(config: {
    agent: Agent;
    wakeQueue: AgentWakeQueue;
  }) {
    const agentId = config.agent.id;
    const displayName = config.agent.name;
    const accountId = await agentAccounts.ensureAccount({
      agentId,
      provider: 'internal-chat',
      externalAccountId: agentId,
      displayName,
    });
    const registeredAgent = {
      agentId,
      accountId,
      displayName,
      wakeQueue: config.wakeQueue,
      messages: createProviderMessageStore({
        agentId,
        provider: 'internal-chat',
      }),
    };

    agents.set(agentId, registeredAgent);
    await syncAgentContacts();

    communicationModule.registerProvider({
      agentId,
      wakeQueue: config.wakeQueue,
      provider: {
        id: 'internal-chat',
        listConversations: ({ contactSlug, unread, limit }) =>
          registeredAgent.messages.listConversations({
            contactSlug,
            unread,
            limit,
          }),
        getMessages: ({ conversationId, limit }) =>
          registeredAgent.messages.getMessages({
            conversationId,
            limit,
          }),
        findMessage: (messageId) => registeredAgent.messages.findMessage(messageId),
        sendMessage: async (input) => {
          const recipient = agents.get(input.target);

          if (!recipient) {
            throw new Error(`Internal chat target not found: ${input.target}`);
          }

          const messageId = `internal:${crypto.randomUUID()}`;
          await recipient.messages.saveInboundMessage({
            messageId,
            channelId: registeredAgent.agentId,
            channelName: registeredAgent.displayName,
            authorId: registeredAgent.agentId,
            authorName: registeredAgent.displayName,
            username: registeredAgent.agentId,
            content: input.content,
            attachments: [],
            createdAt: new Date().toISOString(),
            metadata: {
              provider: 'internal-chat',
              replyToMessageId: input.replyToMessageId,
            },
          });
          await communicationModule.receiveInboundMessage({
            agentId: recipient.agentId,
            provider: 'internal-chat',
            authorId: registeredAgent.agentId,
            authorName: registeredAgent.displayName,
            username: registeredAgent.agentId,
          });
          await registeredAgent.messages.saveOutboundMessage({
            messageId,
            channelId: registeredAgent.agentId,
            channelName: registeredAgent.displayName,
            content: input.content,
            metadata: {
              contactSlug: input.contactSlug,
              replyToMessageId: input.replyToMessageId,
            },
          });

          return { messageId, channelId: registeredAgent.agentId };
        },
      },
    });
  }

  function unregisterAgent(agentId: string) {
    const registeredAgent = agents.get(agentId);

    if (!registeredAgent) {
      return;
    }

    communicationModule.unregisterProvider(agentId, 'internal-chat');
    agents.delete(agentId);
  }

  return {
    registerAgent,
    unregisterAgent,
  };
}
