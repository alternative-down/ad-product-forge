import { randomUUID } from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

import {
  ensureAccount,
  ingestInboundMessage,
  registerAccountSender,
  unregisterAccountSender,
  upsertAgentContact,
} from '../accounts/account-service';
import { getAgentWakeQueue } from '../wake/agent-wake-queue';

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
      wakePrompt?: string;
    }) {
      const agentId = config.agentId ?? config.agent.id;
      const displayName = config.displayName ?? config.agent.name;
      const accountId = await ensureAccount({
        agentId,
        provider: 'internal-chat',
        externalAccountId: agentId,
        displayName,
      });

      const wakeQueue = getAgentWakeQueue({
        agentId,
        agent: config.agent,
        wakePrompt: config.wakePrompt,
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

        await upsertAgentContact({
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

        await upsertAgentContact({
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

      registerAccountSender(accountId, async (input) => {
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

        await ingestInboundMessage({
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
            mode: input.mode,
          },
        });

        recipient.wakeQueue.notifyExternalEvent();
        return { messageId };
      });

      return {
        accountId,
      };
    },

    unregisterAgent(agentId: string) {
      const agent = agents.get(agentId);
      if (!agent) {
        return;
      }

      unregisterAccountSender(agent.accountId);
      agents.delete(agentId);
    },
  };
}
