import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type {Database} from '../database/client'
import { sortParticipantsBySelfFirst } from './internal-chat-helpers';

// =============================================================================
// Participant listing
// =============================================================================

export function createInternalChatParticipants(db: Database) {

  /**
   * Lists group members and DM peers for a conversation by accountId.
   */
  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
    try {
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
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-participants',
        level: 'error',
        message: `listGroupMembersOrDmPeersByAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { accountId, conversationId },
      });
      forgeDebug({ scope: 'internal-chat-participants', level: 'error', message: 'internal-chat-participants operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /**
   * Lists group members and DM peers by agentId (resolves account first).
   */
  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    try {
      const account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
      if (!account) return [];
      return listGroupMembersOrDmPeersByAccount(account.id, conversationId);
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-participants',
        level: 'error',
        message: `listGroupMembersOrDmPeers failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, conversationId },
      });
      forgeDebug({ scope: 'internal-chat-participants', level: 'error', message: 'internal-chat-participants operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return { listGroupMembersOrDmPeers, listGroupMembersOrDmPeersByAccount };
}