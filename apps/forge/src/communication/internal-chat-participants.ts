import {
  and as _and,
  desc as _desc,
  eq,
  inArray as _inArray,
  isNull as _isNull,
  sql as _sql,
} from 'drizzle-orm';
import { forgeDebug as _forgeDebug } from '@forge-runtime/core';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations as _internalChatConversations,
  internalChatMessageReads as _internalChatMessageReads,
  internalChatMessages as _internalChatMessages,
} from '../database/schema';
import type { Database } from '../database/client';
import { sortParticipantsBySelfFirst } from './internal-chat-helpers';

// =============================================================================
// Participant listing
// =============================================================================

export function createInternalChatParticipants(db: Database) {
  /**
   * Lists group members and DM peers for a conversation by accountId.
   */
  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
    const rows = await db
      .select({
        accountId: internalChatConversationMembers.accountId,
        agentId: internalChatAccounts.agentId,
        slug: internalChatAccounts.slug,
        displayName: internalChatAccounts.displayName,
      })
      .from(internalChatConversationMembers)
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatConversationMembers.accountId),
      )
      .where(eq(internalChatConversationMembers.conversationId, conversationId));

    return sortParticipantsBySelfFirst(rows as any, accountId);
  }

  /**
   * Lists group members and DM peers by agentId (resolves account first).
   */
  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    const account = (await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    })) as any;
    if (account === null || account === undefined) return [];
    return await listGroupMembersOrDmPeersByAccount(account.id, conversationId);
  }

  return { listGroupMembersOrDmPeers, listGroupMembersOrDmPeersByAccount };
}
