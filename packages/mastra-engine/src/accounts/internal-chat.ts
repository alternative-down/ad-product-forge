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
  const agents = new Map<string, RegisteredAgent>();

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

      agents.set(agentId, {
        agentId,
        accountId,
        displayName,
        wakeQueue: config.wakeQueue,
      });

      for (const current of agents.values()) {
        if (current.agentId === agentId) {
          continue;
        }

        await messageStore.upsertAgentContact({
          agentId,
          slug: current.agentId,
          displayName: current.displayName,
          accounts: [
            {
              provider: 'internal-chat',
              externalUserId: current.agentId,
              username: current.agentId,
            },
          ],
        });

        await messageStore.upsertAgentContact({
          agentId: current.agentId,
          slug: agentId,
          displayName,
          accounts: [
            {
              provider: 'internal-chat',
              externalUserId: agentId,
              username: agentId,
            },
          ],
        });
      }

      messageRouter.registerSender(accountId, async (input) => {
        const recipient = input.target ? agents.get(input.target) : null;

        if (!recipient) {
          throw new Error(`Internal chat target not found: ${input.target}`);
        }

        const messageId = `internal:${randomUUID()}`;
        await messageStore.saveInboundMessage({
          agentId: recipient.agentId,
          accountId: recipient.accountId,
          messageId,
          channelId: agentId,
          channelName: displayName,
          authorId: agentId,
          authorName: displayName,
          username: agentId,
          content: input.content,
          attachments: [],
          createdAt: new Date().toISOString(),
          metadata: {
            provider: 'internal-chat',
            replyToMessageId: input.replyToMessageId,
          },
        });

        recipient.wakeQueue.notifyExternalEvent();
        return { messageId };
      });
    },

    unregisterAgent(agentId: string) {
      const agent = agents.get(agentId);

      if (!agent) {
        return;
      }

      messageRouter.unregisterSender(agent.accountId);
      agents.delete(agentId);
    },
  };
}
