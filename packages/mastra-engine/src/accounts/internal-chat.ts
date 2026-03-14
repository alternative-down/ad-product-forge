import crypto from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

import { agentAccounts } from '../agent/agent-accounts';
import { agentContacts } from '../agent/agent-contacts';
import { accountDeliveries } from '../agent/account-deliveries';
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

  async function syncContacts() {
    for (const sourceAgent of agentsById.values()) {
      for (const targetAgent of agentsById.values()) {
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
    agentId?: string;
    displayName?: string;
  }) {
    const agentId = config.agentId ?? config.agent.id;
    const displayName = config.displayName ?? config.agent.name;
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
    };

    agentsById.set(agentId, registeredAgent);
    await syncContacts();

    accountDeliveries.register(accountId, async (input) => {
      const recipient = agentsById.get(input.target);

      if (!recipient) {
        throw new Error(`Internal chat target not found: ${input.target}`);
      }

      const messageId = `internal:${crypto.randomUUID()}`;
      await agentContacts.syncInboundContact({
        agentId: recipient.agentId,
        provider: 'internal-chat',
        authorId: registeredAgent.agentId,
        authorName: registeredAgent.displayName,
        username: registeredAgent.agentId,
      });
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
      return { messageId, channelId: registeredAgent.agentId };
    });
  }

  function unregisterAgent(agentId: string) {
    const registeredAgent = agentsById.get(agentId);

    if (!registeredAgent) {
      return;
    }

    accountDeliveries.unregister(registeredAgent.accountId);
    agentsById.delete(agentId);
  }

  return {
    registerAgent,
    unregisterAgent,
  };
}
