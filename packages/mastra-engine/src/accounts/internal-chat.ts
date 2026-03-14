import crypto from 'node:crypto';

import type { Agent } from '@mastra/core/agent';

import { accountDeliveries } from '../agent/communication/account-deliveries';
import { agentAccounts } from '../agent/communication/agent-accounts';
import { agentContacts } from '../agent/communication/agent-contacts';
import { messageStore } from '../agent/communication/message-store';
import type { AgentWakeQueue } from '../agent/wake-queue';

type InternalChatParticipant = {
  agentId: string;
  accountId: string;
  displayName: string;
  wakeQueue: AgentWakeQueue;
};

export function createInternalChatRouter() {
  const participants = new Map<string, InternalChatParticipant>();

  async function syncContacts() {
    for (const sourceAgent of participants.values()) {
      for (const targetAgent of participants.values()) {
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
    const participant = {
      agentId,
      accountId,
      displayName,
      wakeQueue: config.wakeQueue,
    };

    participants.set(agentId, participant);
    await syncContacts();

    accountDeliveries.register(accountId, async (input) => {
      const recipient = participants.get(input.target);

      if (!recipient) {
        throw new Error(`Internal chat target not found: ${input.target}`);
      }

      const messageId = `internal:${crypto.randomUUID()}`;
      await agentContacts.syncInboundContact({
        agentId: recipient.agentId,
        provider: 'internal-chat',
        authorId: participant.agentId,
        authorName: participant.displayName,
        username: participant.agentId,
      });
      await messageStore.saveInboundMessage({
        agentId: recipient.agentId,
        accountId: recipient.accountId,
        messageId,
        channelId: participant.agentId,
        channelName: participant.displayName,
        authorId: participant.agentId,
        authorName: participant.displayName,
        username: participant.agentId,
        content: input.content,
        attachments: [],
        createdAt: new Date().toISOString(),
        metadata: {
          provider: 'internal-chat',
          replyToMessageId: input.replyToMessageId,
        },
      });

      recipient.wakeQueue.notifyExternalEvent();
      return { messageId, channelId: participant.agentId };
    });
  }

  function unregisterAgent(agentId: string) {
    const participant = participants.get(agentId);

    if (!participant) {
      return;
    }

    accountDeliveries.unregister(participant.accountId);
    participants.delete(agentId);
  }

  return {
    registerAgent,
    unregisterAgent,
  };
}
