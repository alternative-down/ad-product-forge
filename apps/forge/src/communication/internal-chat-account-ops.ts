import { and, eq } from 'drizzle-orm';
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
    createdByAccountId: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
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
      const existing = await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, input.conversationKey),
      });

      if (existing) {
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
        updatedAt: now,
      } as any);

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
  }

  /**
   * Creates a group and adds members in a single DB transaction.
   * This prevents partial failure if a member insert fails after the group is created.
   *
   * Returns the created group with all members, or rolls back everything on failure.
   */
  async function createExternalChatGroupWithMembers(input: {
    accountId: string;
    conversationKey: string;
    name: string;
    memberAccountIds: string[];
  }) {
      // Check if group already exists (outside transaction — not worth locking early)
      const existing = await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, input.conversationKey),
      });

      if (existing) {
        throw new ChatGroupAlreadyExistsError(input.conversationKey);
      }

      // Resolve account IDs once before transaction
      const creatorAccount = await deps.getRequiredExternalAccount(input.accountId);
      const memberAccounts = await Promise.all(
        input.memberAccountIds.map((id) => deps.getRequiredAccount(id)),
      );

      const now = Date.now();

      const groupMembers = await db.transaction(async (tx) => {
        // Insert group
        await tx.insert(internalChatConversations).values({
          id: input.conversationKey,
          type: 'group',
          name: input.name,
          createdByAccountId: creatorAccount.id,
          createdAt: now,
          updatedAt: now,
        });

        // Insert creator as admin
        await tx.insert(internalChatConversationMembers).values({
          conversationId: input.conversationKey,
          accountId: creatorAccount.id,
          role: 'admin',
          createdAt: now,
          updatedAt: now,
        } as any);

        // Filter out accounts already in the group (idempotent)
        const creatorId = creatorAccount.id;
        const membersToAdd = memberAccounts
          .map((a) => a.id)
          .filter((id) => id !== creatorId);

        if (membersToAdd.length > 0) {
          await tx.insert(internalChatConversationMembers).values((membersToAdd.map((accountId) => ({
              conversationId: input.conversationKey,
              accountId,
              role: 'normal',
              createdAt: now,
              updatedAt: now,
            })) as any));
        }

        // Read back all members
        const members = await tx.query.internalChatConversationMembers.findMany({
          where: eq(internalChatConversationMembers.conversationId, input.conversationKey),
        });

        return members;
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
        members: groupMembers.map((m) => ({
          participantId: m.accountId,
          role: m.role,
        })),
        createdAt: new Date(now).toISOString(),
      };
  }
  async function ensureDirectConversationByAccount(input: {
    accountId: string;
    participantAccountId: string;
  }) {
      await deps.getRequiredExternalAccount(input.accountId);
      await deps.getRequiredAccount(input.participantAccountId);
      const conversation = await deps.ensureDirectConversation(input.accountId, input.participantAccountId);
      if (conversation === null || conversation === undefined) {
        forgeDebug({ scope: 'internal-chat-account-ops', level: 'error', message: 'internal-chat-account-ops: validation/requirement failed' });
        throw new Error('Direct conversation creation failed');
      }
      return { conversationId: conversation.id, conversationKey: conversation.id };
  }

  async function addMemberToGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role?: string;
  }) {
      const group = await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      const participant = await deps.getRequiredAccount(input.participantAccountId);

      const existing = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.conversationId, group.id),
          eq(internalChatConversationMembers.accountId, participant.id),
        ),
      });

      if (existing) {
        return await deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
      }

      await db.insert(internalChatConversationMembers).values(({
        conversationId: group.id,
        accountId: participant.id,
        role: input.role ?? 'normal',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any));

      return await deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
  }

  async function updateMemberRoleByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role: string;
  }) {
      await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      await db
        .update(internalChatConversationMembers)
        .set({ role: input.role })
        .where(and(
          eq(internalChatConversationMembers.conversationId, input.groupId),
          eq(internalChatConversationMembers.accountId, input.participantAccountId),
        ));
      return await deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
  }

  async function removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }) {
      await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      await db
        .delete(internalChatConversationMembers)
        .where(and(
          eq(internalChatConversationMembers.conversationId, input.groupId),
          eq(internalChatConversationMembers.accountId, input.participantAccountId),
        ));
      return await deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
  }

  async function updateGroupByAccount(input: {
    accountId: string;
    groupId: string;
    name?: string;
    conversationKey?: string;
  }) {
      const group = await deps.getRequiredGroupForAccount(input.accountId, input.groupId);
      const now = Date.now();
      await db
        .update(internalChatConversations)
        .set({ name: input.name ?? group.name, updatedAt: now })
        .where(eq(internalChatConversations.id, input.groupId));
      return await deps.listGroupMembersByAccount({ accountId: input.accountId, groupId: input.groupId });
  }

  return {
    createExternalChatGroup,
    createExternalChatGroupWithMembers,
    ensureDirectConversationByAccount,
    addMemberToGroupByAccount,
    updateMemberRoleByAccount,
    removeMemberFromGroupByAccount,
    updateGroupByAccount,
  };
}
