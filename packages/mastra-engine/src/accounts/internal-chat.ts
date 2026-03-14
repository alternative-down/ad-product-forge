import { randomUUID } from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

import {
  messageStore,
} from '../agent/message-store';
import { getAgentWakeQueue } from '../agent/wake-queue';

type RegisteredInternalAgent = {
  agentId: string;
  accountId: string;
  displayName: string;
  wakeQueue: ReturnType<typeof getAgentWakeQueue>;
};

export function createInternalChatRouter() {
  const agents = new Map<string, RegisteredInternalAgent>();

  return {
    async registerAgent(config: {
      agent: Agent;
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

      const wakeQueue = getAgentWakeQueue({
        agentId,
        agent: config.agent,
      });

      agents.set(agentId, {
        agentId,
        accountId,
        displayName,
        wakeQueue,
      });

      for (const current of agents.values()) {
        if (current.agentId === agentId) {
          continue;
        }

        const currentIdentity = [
          {
            provider: 'internal-chat',
            externalUserId: current.agentId,
            username: current.agentId,
          },
        ];
        const agentIdentity = [
          {
            provider: 'internal-chat',
            externalUserId: agentId,
            username: agentId,
          },
        ];

        await messageStore.upsertAgentContact({
          agentId,
          slug: current.agentId,
          displayName: current.displayName,
          accounts: currentIdentity,
        });

        await messageStore.upsertAgentContact({
          agentId: current.agentId,
          slug: agentId,
          displayName,
          accounts: agentIdentity,
        });
      }

      messageStore.registerAccountSender(accountId, async (input) => {
        const target = input.target;
        if (!target) {
          throw new Error('Internal chat target is required');
        }

        const recipient = agents.get(target);
        if (!recipient) {
          throw new Error(`Internal chat target not found: ${target}`);
        }

        const createdAt = new Date().toISOString();
        const messageId = `internal:${randomUUID()}`;

        await messageStore.ingestInboundMessage({
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
          createdAt,
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

      messageStore.unregisterAccountSender(agent.accountId);
      agents.delete(agentId);
    },
  };
}
