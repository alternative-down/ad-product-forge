import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type { Database } from '../database/index';
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

    return sortParticipantsBySelfFirst(rows, accountId);
  }

  /**
   * Lists group members and DM peers by agentId (resolves account first).
   */
  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
    if (!account) return [];
    return listGroupMembersOrDmPeersByAccount(account.id, conversationId);
  }

  return { listGroupMembersOrDmPeers, listGroupMembersOrDmPeersByAccount };
}