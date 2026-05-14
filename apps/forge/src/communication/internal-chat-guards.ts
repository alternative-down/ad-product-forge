import { forgeDebug } from '@forge-runtime/core';

import { and, eq } from 'drizzle-orm';
import { internalChatConversationMembers, internalChatConversations } from '../database/schema';

import type {Database} from '../database/schema';
import { ConversationNotFoundError, ChatGroupNotFoundError } from './internal-chat-errors';

export interface InternalChatGuardsDeps {
  getRequiredAgentAccount(agentId: string): Promise<{
    id: string;
    agentId: string;
    slug: string;
    displayName: string;
  }>;
}

export function createInternalChatGuards(db: Database, deps: InternalChatGuardsDeps) {

  async function requireConversationMembership(agentId: string, conversationId: string) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return await requireConversationMembershipByAccount(account.id, conversationId);
  }

  async function requireConversationMembershipByAccount(accountId: string, conversationId: string) {
    let membership;
    try {
      membership = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, accountId),
          eq(internalChatConversationMembers.conversationId, conversationId),
        ),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-guards', level: 'error', message: '[internal-chat-guards] requireConversationMembershipByAccount lookup failed', context: { error: err instanceof Error ? err.message : String(err), accountId, conversationId } });
      throw err;
    }

    if (!membership) {
      forgeDebug({ scope: 'internal-chat-guards', level: 'warn', message: 'requireConversation: not found', context: { conversationId } });
      throw new ConversationNotFoundError(conversationId);
    }
  }

  async function getRequiredConversationForAgent(agentId: string, conversationId: string) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return await getRequiredConversationForAccount(account.id, conversationId);
  }

  async function getRequiredConversationForAccount(accountId: string, conversationId: string) {
    await requireConversationMembershipByAccount(accountId, conversationId);

    let conversation;
    try {
      conversation = await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, conversationId),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-guards', level: 'error', message: '[internal-chat-guards] getRequiredConversationForAccount lookup failed', context: { error: err instanceof Error ? err.message : String(err), accountId, conversationId } });
      throw err;
    }

    if (!conversation) {
      forgeDebug({ scope: 'internal-chat-guards', level: 'warn', message: 'requireConversation: not found', context: { conversationId } });
      throw new ConversationNotFoundError(conversationId);
    }

    return conversation;
  }

  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const group = await getRequiredConversationForAgent(agentId, groupId);

    if (group.type !== 'group') {
      forgeDebug({ scope: 'internal-chat-guards', level: 'warn', message: 'requireGroup: not found', context: { groupId } });
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }

  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const group = await getRequiredConversationForAccount(accountId, groupId);

    if (group.type !== 'group') {
      forgeDebug({ scope: 'internal-chat-guards', level: 'warn', message: 'requireGroup: not found', context: { groupId } });
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }

  return {
    requireConversationMembership,
    requireConversationMembershipByAccount,
    getRequiredConversationForAgent,
    getRequiredConversationForAccount,
    getRequiredGroupForAgent,
    getRequiredGroupForAccount,
  };
}
