import { and, eq } from 'drizzle-orm';
import { internalChatConversationMembers, internalChatConversations } from '../database/schema';
import type { Database } from '../database/index';
import { forgeDebug } from '@forge-runtime/core';
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
    return requireConversationMembershipByAccount(account.id, conversationId);
  }

  async function requireConversationMembershipByAccount(accountId: string, conversationId: string) {
    try {
      const membership = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, accountId),
          eq(internalChatConversationMembers.conversationId, conversationId),
        ),
      });

      if (!membership) {
        throw new ConversationNotFoundError(conversationId);
      }
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-guards', level: 'error', message: '[internal-chat-guards] requireConversationMembershipByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getRequiredConversationForAgent(agentId: string, conversationId: string) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return getRequiredConversationForAccount(account.id, conversationId);
  }

  async function getRequiredConversationForAccount(accountId: string, conversationId: string) {
    try {
      await requireConversationMembershipByAccount(accountId, conversationId);

      const conversation = await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, conversationId),
      });

      if (!conversation) {
        throw new ConversationNotFoundError(conversationId);
      }

      return conversation;
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-guards', level: 'error', message: '[internal-chat-guards] getRequiredConversationForAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const group = await getRequiredConversationForAgent(agentId, groupId);

    if (group.type !== 'group') {
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }

  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const group = await getRequiredConversationForAccount(accountId, groupId);

    if (group.type !== 'group') {
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
