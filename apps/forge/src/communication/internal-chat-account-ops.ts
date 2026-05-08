import { and, eq } from 'drizzle-orm';
import { createId } from '../utils/id';
import {
  internalChatConversationMembers,
  internalChatConversations,
} from '../database/schema';
import type {Database} from '../database/client'
import { forgeDebug } from '@forge-runtime/core';
import { ChatGroupAlreadyExistsError } from './internal-chat-errors';

// =============================================================================
// Account-scoped group and conversation operations
// These are the ByAccount variants used by admin routes and external integrations.
// =============================================================================

export interface InternalChatAccountOpsDeps {
  getRequiredAccount(accountId: string): Promise<{
    id: string;
    agentId: string | null;
    slug: string;
    displayName: string;
  }>;
  getRequiredExternalAccount(accountId: string): Promise<{
    id: string;
    agentId: string | null;
    slug: string;
    displayName: string;
  }>;
  ensureDirectConversation(leftAccountId: string, rightAccountId: string): Promise<{
    id: string;
    type: string;
    name: string | null;
    createdByAccountId: string;
    createdAt: number;
    updatedAt: number;
  } | null>;
  listGroupMembersByAccount(input: {
    accountId: string;
    groupId: string;
  }): Promise<Array<{
    participantId: string;
    participantName: string;
    role: string;
    joinedAt: string;
  }>>;
  getRequiredGroupForAccount(accountId: string, groupId: string): Promise<{
    id: string;
    type: string;
    name: string | null;
  }>;
}

export function createInternalChatAccountOps(
  db: Database,
  deps: InternalChatAccountOpsDeps,
) {

  async function createExternalChatGroup(input: {
    accountId: string;
    conversationKey: string;
    name: string;
  }) {
    try {
      const existing = await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, input.conversationKey),
      });

      if (existing) {
        forgeDebug({ scope: 'internal-chat-account-ops', level: 'warn', message: 'getOrCreateDirectConversation: group already exists', context: { conversationKey: input.conversationKey } });
        forgeDebug({ scope: 'internal-chat-account-ops', level: 'warn', message: 'getOrCreateDirect: group already exists', context: { conversationKey: input.conversationKey } });
        throw new ChatGroupAlreadyExistsError(input.conversationKey);
      }

      const creatorAccount = await deps.getRequiredExternalAccount(input.accountId);
      const now = Date.now();

      await db.insert(internalChatConversations).values({
        id: input.conversationKey,
        type: 'group',
        name: input.name,
        createdByAccountId: creatorAccount.id,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(internalChatConversationMembers).values({
        conversationId: input.conversationKey,
        accountId: creatorAccount.id,
        role: 'admin',
        createdAt: now,
      });

      return {
        groupId: input.conversationKey,
        name: input.name,
        provider: 'internal-chat',
        conversationKey: input.conversationKey,
        creatorMember: {
          participantId: creatorAccount.id,
          participantName: creatorAccount.displayName,
          role: 'admin',
        },
        createdAt: new Date(now).toISOString(),
      };
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: '[internal-chat-account-ops] createExternalChatGroup failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function ensureDirectConversationByAccount(input: {
    accountId: string;
    participantAccountId: string;
  }) {
    try {
      await deps.getRequiredExternalAccount(input.accountId);
      await deps.getRequiredAccount(input.participantAccountId);
      const conversation = await deps.ensureDirectConversation(input.accountId, input.participantAccountId);
      if (!conversation) {
        forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: 'getOrCreateDirectConversation: creation failed' });
        forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: 'getOrCreateDirect: creation failed' });
        throw new Error('Direct conversation creation failed');
      }
      return { conversationId: conversation.id, conversationKey: conversation.id };
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: '[internal-chat-account-ops] ensureDirectConversationByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function addMemberToGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role?: string;
  }) {
    try {
      const group = await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      const participant = await deps.getRequiredAccount(input.participantAccountId);

      const existing = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.conversationId, group.id),
          eq(internalChatConversationMembers.accountId, participant.id),
        ),
      });

      if (existing) {
        return deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
      }

      await db.insert(internalChatConversationMembers).values({
        conversationId: group.id,
        accountId: participant.id,
        role: input.role ?? 'normal',
        createdAt: Date.now(),
      });

      return deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: '[internal-chat-account-ops] addMemberToGroupByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function updateMemberRoleByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role: string;
  }) {
    try {
      await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      await db
        .update(internalChatConversationMembers)
        .set({ role: input.role })
        .where(and(
          eq(internalChatConversationMembers.conversationId, input.groupId),
          eq(internalChatConversationMembers.accountId, input.participantAccountId),
        ));
      return deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: '[internal-chat-account-ops] updateMemberRoleByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }) {
    try {
      await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      await db
        .delete(internalChatConversationMembers)
        .where(and(
          eq(internalChatConversationMembers.conversationId, input.groupId),
          eq(internalChatConversationMembers.accountId, input.participantAccountId),
        ));
      return deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: '[internal-chat-account-ops] removeMemberFromGroupByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function updateGroupByAccount(input: {
    accountId: string;
    groupId: string;
    name?: string;
    conversationKey?: string;
  }) {
    try {
      const group = await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      const now = Date.now();
      await db
        .update(internalChatConversations)
        .set({ name: input.name ?? group.name, updatedAt: now })
        .where(eq(internalChatConversations.id, input.groupId));
      return deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: '[internal-chat-account-ops] updateGroupByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    createExternalChatGroup,
    ensureDirectConversationByAccount,
    addMemberToGroupByAccount,
    updateMemberRoleByAccount,
    removeMemberFromGroupByAccount,
    updateGroupByAccount,
  };
}
