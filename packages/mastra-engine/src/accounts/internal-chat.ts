import { randomUUID } from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

import { messageRouter } from '../agent/message-router';
import { messageStore } from '../agent/message-store';
import type { AgentWakeQueue } from '../agent/wake-queue';

type RegisteredAgent = {
  agentId: string;
  accountId: string;
  displayName: string;
  wakeQueue: AgentWakeQueue;
};

export function createInternalChatRouter() {
  const agentsById = new Map<string, RegisteredAgent>();

  return {
    async registerAgent(config: {
      agent: Agent;
      wakeQueue: AgentWakeQueue;
      agentId?: string;
      displayName?: string;
    }) {
      const agentId = config.agentId ?? config.agent.id;
      const displayName = config.displayName ?? config.agent.name;
      const accountId = await messageStore.ensureAccount({
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
      };

      agentsById.set(agentId, registeredAgent);

      for (const currentAgent of agentsById.values()) {
        for (const peerAgent of agentsById.values()) {
          if (currentAgent.agentId === peerAgent.agentId) {
            continue;
          }

          await messageStore.upsertAgentContact({
            agentId: currentAgent.agentId,
            slug: peerAgent.agentId,
            displayName: peerAgent.displayName,
            accounts: [
              {
                provider: 'internal-chat',
                externalUserId: peerAgent.agentId,
                username: peerAgent.agentId,
              },
            ],
          });
        }
      }

      messageRouter.registerSender(accountId, async (input) => {
        const recipient = agentsById.get(input.target);

        if (!recipient) {
          throw new Error(`Internal chat target not found: ${input.target}`);
        }

        const messageId = `internal:${randomUUID()}`;
        await messageStore.saveInboundMessage({
          agentId: recipient.agentId,
          accountId: recipient.accountId,
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

        recipient.wakeQueue.notifyExternalEvent();

        return {
          messageId,
          channelId: registeredAgent.agentId,
        };
      });
    },

    unregisterAgent(agentId: string) {
      const registeredAgent = agentsById.get(agentId);

      if (!registeredAgent) {
        return;
      }

      messageRouter.unregisterSender(registeredAgent.accountId);
      agentsById.delete(agentId);
    },
  };
}
