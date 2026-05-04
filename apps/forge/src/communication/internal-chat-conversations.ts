import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createId } from '../utils/id';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
} from '../database/schema';
import type { Database } from '../database/index';
import { parseFilterDate } from './internal-chat-helpers';
import { InternalChatError } from './internal-chat-errors';

// =============================================================================
// Conversation setup and membership management
// =============================================================================

export function createInternalChatConversations(db: Database) {

  /**
   * Finds or creates a DM conversation between two accounts.
   * Uses the existing shared conversation if one already exists.
   */
  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    const rows = await db
      .select({ conversationId: internalChatConversationMembers.conversationId })
      .from(internalChatConversationMembers)
      .where(inArray(internalChatConversationMembers.accountId, [leftAccountId, rightAccountId]))
      .all();

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
    }

    const candidateConversationIds = Array.from(counts.entries())
      .filter(([, count]) => count === 2)
      .map(([conversationId]) => conversationId);

    if (candidateConversationIds.length > 0) {
      const existing = await db.query.internalChatConversations.findFirst({
        where: and(
          eq(internalChatConversations.type, 'dm'),
          inArray(internalChatConversations.id, candidateConversationIds),
        ),
      });
      if (existing) return existing;
    }

    const now = Date.now();
    const conversationId = createId();
    await db.insert(internalChatConversations).values({
      id: conversationId,
      type: 'dm',
      name: null,
      createdByAccountId: leftAccountId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(internalChatConversationMembers).values([
      { conversationId, accountId: leftAccountId, role: 'normal', createdAt: now },
      { conversationId, accountId: rightAccountId, role: 'normal', createdAt: now },
    ]);

    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
    return conversation!;
  }

  /**
   * Returns the account row for a given accountId, throwing if not found.
   */
  async function getRequiredExternalAccount(accountId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, accountId),
    });
    if (!account) {
      throw new InternalChatError('account-not-found', `No account found with id: ${accountId}`);
    }
    if (account.type !== 'external') {
      throw new InternalChatError('invalid-account-type', `Account ${accountId} is not an external account`);
    }
    return account;
  }

  /**
   * Returns the account row for a given slug, throwing if not found or not external.
   */
  async function getRequiredAccountBySlug(slug: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, slug),
    });
    if (!account) {
      throw new InternalChatError('account-not-found', `No account found with slug: ${slug}`);
    }
    if (account.type !== 'external') {
      throw new InternalChatError('invalid-account-type', `Account ${slug} is not an external account`);
    }
    return account;
  }

  /**
   * Throws if the given agent is not a member of the conversation.
   */
  async function requireConversationMembership(agentId: string, conversationId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
    if (!account) {
      throw new InternalChatError('account-not-found', `No account found for agent: ${agentId}`);
    }
    const member = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.conversationId, conversationId),
        eq(internalChatConversationMembers.accountId, account.id),
      ),
    });
    if (!member) {
      throw new InternalChatError('not-a-member', `Account ${account.id} is not a member of conversation ${conversationId}`);
    }
    return member;
  }

  /**
   * Throws if the given account is not a member of the conversation.
   */
  async function requireConversationMembershipByAccount(accountId: string, conversationId: string) {
    const member = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.conversationId, conversationId),
        eq(internalChatConversationMembers.accountId, accountId),
      ),
    });
    if (!member) {
      throw new InternalChatError('not-a-member', `Account ${accountId} is not a member of conversation ${conversationId}`);
    }
    return member;
  }

  /**
   * Returns the conversation row for the given agent + conversationId, throwing if not found.
   */
  async function getRequiredConversationForAgent(agentId: string, conversationId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
    if (!account) {
      throw new InternalChatError('account-not-found', `No account found for agent: ${agentId}`);
    }
    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
    if (!conversation) {
      throw new InternalChatError('conversation-not-found', `Conversation ${conversationId} not found`);
    }
    return conversation;
  }

  /**
   * Returns the conversation row for the given account + conversationId, throwing if not found.
   */
  async function getRequiredConversationForAccount(accountId: string, conversationId: string) {
    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
    if (!conversation) {
      throw new InternalChatError('conversation-not-found', `Conversation ${conversationId} not found`);
    }
    return conversation;
  }

  /**
   * Returns the group row for the given agent + groupId, throwing if not found or is a DM.
   */
  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
    if (!account) {
      throw new InternalChatError('account-not-found', `No account found for agent: ${agentId}`);
    }
    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, groupId),
    });
    if (!conversation) {
      throw new InternalChatError('conversation-not-found', `Group ${groupId} not found`);
    }
    if (conversation.type === 'dm') {
      throw new InternalChatError('not-a-group', `Conversation ${groupId} is a direct message, not a group`);
    }
    return conversation;
  }

  /**
   * Returns the group row for the given account + groupId, throwing if not found or is a DM.
   */
  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, groupId),
    });
    if (!conversation) {
      throw new InternalChatError('conversation-not-found', `Group ${groupId} not found`);
    }
    if (conversation.type === 'dm') {
      throw new InternalChatError('not-a-group', `Conversation ${groupId} is a direct message, not a group`);
    }
    return conversation;
  }

  return {
    ensureDirectConversation,
    getRequiredExternalAccount,
    getRequiredAccountBySlug,
    requireConversationMembership,
    requireConversationMembershipByAccount,
    getRequiredConversationForAgent,
    getRequiredConversationForAccount,
    getRequiredGroupForAgent,
    getRequiredGroupForAccount,
  };
}