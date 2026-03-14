import crypto from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

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

        await messageStore.upsertAgentContact({
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
    await syncContacts();

    messageStore.registerSender(accountId, async (input) => {
      const recipient = agentsById.get(input.target);

      if (!recipient) {
        throw new Error(`Internal chat target not found: ${input.target}`);
      }

      const messageId = `internal:${crypto.randomUUID()}`;
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

      messageStore.unregisterSender(registeredAgent.accountId);
    agentsById.delete(agentId);
  }

  return {
    registerAgent,
    unregisterAgent,
  };
}
