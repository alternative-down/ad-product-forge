import { and, desc, eq, sql } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import {
  resolveChatGroupMembers,
  createChatGroupIfNeeded,
  updateChatGroupName,
  syncChatGroupMembers,
  generateGroupId,
} from './internal-chat-groups-helpers';

import {
  buildGroupRow,
  sortParticipantsBySelfFirst,
  type InternalChatGroupMember,
  type InternalChatGroupParticipant,
  type InternalChatGroupRow,
} from './internal-chat-helpers';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  type InternalChatConversation,
  type InternalChatConversationMember,
  type NewInternalChatConversationMember,
} from '../database/schema';
import type { Database } from '../database/client';
import { findOrThrow } from '../database/find-or-throw';

const logInternalChatError = (
  context: string,
  error: unknown,
  extra: Record<string, unknown> = {},
) => {
  forgeDebug({
    scope: 'internal-chat-groups',
    level: 'error',
    ...extra,
    message: `${context} failed: ${errorMsg(error)}`,
  });
};

const logInternalChatWarn = (
  message: string,
  context: Record<string, unknown> = {},
): void => {
  forgeDebug({
    scope: 'internal-chat-groups',
    level: 'warn',
    message,
    ...context,
  });
};

export interface CreateChatGroupInput {
  agentId: string;
  conversationKey: string;
  name: string;
  creatorName: string;
}
import { errorMsg } from '../agents/error-formatting';

import {
  ChatGroupNotFoundError,
  ChatGroupAlreadyExistsError,
  ChatGroupMemberAlreadyExistsError,
  ChatGroupAdminRequiredError,
  ChatGroupNameRequiredError,
} from './internal-chat-errors';

export interface AddMemberToGroupInput {
  agentId: string;
  groupId: string;
  participantSlug: string;
  role?: string;
}

export interface RemoveMemberFromGroupInput {
  agentId: string;
  groupId: string;
  participantSlug: string;
}

export interface ChangeChatGroupInput {
  agentId: string;
  groupId?: string;
  name?: string;
  members?: Array<{
    participantKey: string;
    role?: 'admin' | 'normal';
  }>;
}

export interface ListGroupMembersByAccountInput {
  accountId: string;
  groupId: string;
}

export interface ListGroupMembersInput {
  agentId: string;
  groupId: string;
}

export interface ListChatGroupsInput {
  agentId: string;
  limit: number;
}

export function createInternalChatGroups(
  db: Database,
  deps: {
    getRequiredAccount: (accountId: string) => Promise<{
      id: string;
      agentId: string | null;
      slug: string;
      displayName: string;
    }>;
    getRequiredAgentAccount: (agentId: string) => Promise<{
      id: string;
      agentId: string | null;
      slug: string;
      displayName: string;
    }>;
    getRequiredAccountBySlug: (slug: string) => Promise<{
      id: string;
      agentId: string | null;
      slug: string;
      displayName: string;
    }>;
    getAccountByTargetKey: (targetKey: string) => Promise<{
      id: string;
      agentId: string | null;
      slug: string;
      displayName: string;
    }>;
  },
) {
  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  async function getRequiredConversationForAgent(agentId: string, conversationId: string) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return await getRequiredConversationForAccount(account.id, conversationId);
  }

  async function getRequiredConversationForAccount(accountId: string, conversationId: string) {
    await requireConversationMembershipByAccount(accountId, conversationId);

    try {
      const conversation = await findOrThrow(
        db.query.internalChatConversations,
        {
          scope: 'internal-chat-groups',
          entity: 'Conversation',
          op: 'getRequiredConversationForAccount',
          idValue: conversationId,
          idField: 'conversationId',
        },
        { where: eq(internalChatConversations.id, conversationId) },
      );
      return conversation;
    } catch (err) {
      if (!(err instanceof Error)) throw err;
      logInternalChatError('getRequiredConversationForAccount lookup', errorMsg(err), { conversationId });
      throw err;
    }
  }

  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const group = await getRequiredConversationForAgent(agentId, groupId);

    if (group.type !== 'group') {
      logInternalChatWarn('getRequiredGroupForAgent type check failed', { groupId });
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }

  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const group = await getRequiredConversationForAccount(accountId, groupId);

    if (group.type !== 'group') {
      logInternalChatWarn('getRequiredGroupForAccount type check failed', { groupId });
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }

  async function requireConversationMembership(agentId: string, conversationId: string) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return await requireConversationMembershipByAccount(account.id, conversationId);
  }

  async function requireConversationMembershipByAccount(accountId: string, conversationId: string) {
    try {
      await findOrThrow(
        db.query.internalChatConversationMembers,
        {
          scope: 'internal-chat-groups',
          entity: 'Conversation',
          op: 'requireConversationMembershipByAccount',
          idValue: conversationId,
          idField: 'conversationId',
        },
        {
          where: and(
            eq(internalChatConversationMembers.accountId, accountId),
            eq(internalChatConversationMembers.conversationId, conversationId),
          ),
        },
      );
    } catch (err) {
      logInternalChatError('Failed to execute requireConversationMembershipByAccount', errorMsg(err));
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Public API — group CRUD
  // -----------------------------------------------------------------------

  async function createChatGroup(input: CreateChatGroupInput) {
    try {
      const existing = (await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, input.conversationKey),
      })) as InternalChatConversation | null;

      if (existing != null) {
        logInternalChatWarn('createGroup: already exists', { conversationKey: input.conversationKey });
        throw new ChatGroupAlreadyExistsError(input.conversationKey);
      }

      const now = Date.now();
      const creatorAccount = await deps.getRequiredAgentAccount(input.agentId);

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
      } as NewInternalChatConversationMember);

      return {
        groupId: input.conversationKey,
        name: input.name,
        provider: 'internal-chat',
        conversationKey: input.conversationKey,
        creatorMember: {
          participantId: creatorAccount.id,
          participantName: input.creatorName,
          role: 'admin',
        },
        createdAt: new Date(now).toISOString(),
      };
    } catch (err) {
      logInternalChatError('createChatGroup', err, {
        conversationKey: input.conversationKey,
        agentId: input.agentId,
      });
      throw err;
    }
  }

  async function addMemberToGroup(input: AddMemberToGroupInput) {
    try {
      const group = await getRequiredGroupForAgent(input.agentId, input.groupId);
      const participant = await deps.getRequiredAccountBySlug(input.participantSlug);
      const now = Date.now();

      const existing = (await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.conversationId, group.id),
          eq(internalChatConversationMembers.accountId, participant.id),
        ),
      })) as InternalChatConversationMember | null;

      if (existing != null) {
        throw new ChatGroupMemberAlreadyExistsError(input.participantSlug);
      }

      await db.insert(internalChatConversationMembers).values({
        conversationId: group.id,
        accountId: participant.id,
        role: input.role ?? 'normal',
        createdAt: now,
        updatedAt: now,
      });

      return {
        groupId: group.id,
        participantSlug: participant.slug,
        participantId: participant.id,
        participantName: participant.displayName,
        role: input.role ?? 'normal',
        createdAt: new Date(now).toISOString(),
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) throw err;
      logInternalChatError('addMemberToGroup', err, {
        groupId: input.groupId,
        agentId: input.agentId,
        participantSlug: input.participantSlug,
      });
      throw err;
    }
  }

  async function removeMemberFromGroup(input: RemoveMemberFromGroupInput) {
    try {
      await getRequiredGroupForAgent(input.agentId, input.groupId);
      const participant = await deps.getRequiredAccountBySlug(input.participantSlug);

      await db
        .delete(internalChatConversationMembers)
        .where(
          and(
            eq(internalChatConversationMembers.conversationId, input.groupId),
            eq(internalChatConversationMembers.accountId, participant.id),
          ),
        );

      return {
        success: true,
        groupId: input.groupId,
        participantSlug: participant.slug,
      };
    } catch (err) {
      logInternalChatError('removeMemberFromGroup', err, {
        groupId: input.groupId,
        agentId: input.agentId,
        participantSlug: input.participantSlug,
      });
      throw err;
    }
  }

  async function changeChatGroup(input: ChangeChatGroupInput) {
    const actorAccount = await deps.getRequiredAgentAccount(input.agentId);
    const now = Date.now();
    const groupId = input.groupId ?? generateGroupId();

    // ── Resolve members ────────────────────────────────────────────────────────
    let desiredMembers: Map<
      string,
      import('./internal-chat-groups-helpers').ResolvedGroupMember
    > | null = null;
    if (input.members) {
      desiredMembers = await resolveChatGroupMembers(db, input.members, actorAccount);
    }

    // ── Access control ──────────────────────────────────────────────────────────
    if (input.groupId != null) {
      await getRequiredGroupForAgent(input.agentId, groupId);
      const membership = (await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.conversationId, groupId),
          eq(internalChatConversationMembers.accountId, actorAccount.id),
        ),
      })) as InternalChatConversationMember | null;
      if (membership == null || membership.role !== 'admin') {
        throw new ChatGroupAdminRequiredError();
      }
    } else {
      if (input.name == null) {
        throw new ChatGroupNameRequiredError();
      }
    }

    // ── Persist ────────────────────────────────────────────────────────────────
    try {
      await db.transaction(async (tx) => {
        if (input.groupId == null) {
          await createChatGroupIfNeeded(
            tx,
            groupId,
            input.name,
            actorAccount,
            now,
          );
        }
        if (input.name !== undefined) {
          await updateChatGroupName(tx, groupId, input.name, now);
        }
        if (desiredMembers) {
          await syncChatGroupMembers(tx, groupId, desiredMembers, now);
        }
      });

      return {
        groupId,
        provider: 'internal-chat',
        conversationKey: groupId,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('not found') || err.message.includes('Admin permission'))
      )
        throw err;
      logInternalChatError('changeChatGroup', err, {
        groupId: input.groupId,
        agentId: input.agentId,
      });
      throw err;
    }
  }

  async function listChatGroups(input: ListChatGroupsInput) {
    try {
      const agentAccount = await deps.getRequiredAgentAccount(input.agentId);

      const rows = await db
        .select({
          id: internalChatConversations.id,
          name: internalChatConversations.name,
          createdAt: internalChatConversations.createdAt,
          updatedAt: internalChatConversations.updatedAt,
        })
        .from(internalChatConversations)
        .innerJoin(
          internalChatConversationMembers,
          eq(internalChatConversationMembers.conversationId, internalChatConversations.id),
        )
        .where(
          and(
            eq(internalChatConversations.type, 'group'),
            eq(internalChatConversationMembers.accountId, agentAccount.id),
          ),
        )
        .orderBy(desc(internalChatConversations.updatedAt))
        .limit(input.limit)
        .all();

      return rows.map((row) => buildGroupRow(row satisfies InternalChatGroupRow));
    } catch (err) {
      logInternalChatError('listChatGroups', err, { agentId: input.agentId, limit: input.limit });
      throw err;
    }
  }

  async function listGroupMembers(input: ListGroupMembersInput) {
    try {
      await getRequiredGroupForAgent(input.agentId, input.groupId);

      const rows = await db
        .select({
          groupId: internalChatConversationMembers.conversationId,
          participantId: internalChatAccounts.id,
          participantKey: sql<string>`coalesce(${internalChatAccounts.agentId}, ${internalChatAccounts.slug})`,
          participantSlug: internalChatAccounts.slug,
          participantName: internalChatAccounts.displayName,
          role: internalChatConversationMembers.role,
          createdAt: internalChatConversationMembers.createdAt,
        })
        .from(internalChatConversationMembers)
        .innerJoin(
          internalChatAccounts,
          eq(internalChatAccounts.id, internalChatConversationMembers.accountId),
        )
        .where(eq(internalChatConversationMembers.conversationId, input.groupId))
        .all();

      return rows.map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
      }));
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) throw err;
      logInternalChatError('listGroupMembers', err, {
        groupId: input.groupId,
        agentId: input.agentId,
      });
      throw err;
    }
  }

  async function listGroupMembersByAccount(
    input: ListGroupMembersByAccountInput,
  ): Promise<InternalChatGroupMember[]> {
    try {
      await getRequiredGroupForAccount(input.accountId, input.groupId);

      const rows = await db
        .select({
          groupId: internalChatConversationMembers.conversationId,
          participantId: internalChatAccounts.id,
          participantKey: sql<string>`coalesce(${internalChatAccounts.agentId}, ${internalChatAccounts.slug})`,
          participantSlug: internalChatAccounts.slug,
          participantName: internalChatAccounts.displayName,
          role: internalChatConversationMembers.role,
          createdAt: internalChatConversationMembers.createdAt,
        })
        .from(internalChatConversationMembers)
        .innerJoin(
          internalChatAccounts,
          eq(internalChatAccounts.id, internalChatConversationMembers.accountId),
        )
        .where(eq(internalChatConversationMembers.conversationId, input.groupId))
        .all();

      return rows.map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
      }));
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) throw err;
      logInternalChatError('listGroupMembersByAccount', err, {
        groupId: input.groupId,
        accountId: input.accountId,
      });
      throw err;
    }
  }

  async function listGroupMembersOrDmPeersByAccount(
    accountId: string,
    conversationId: string,
  ): Promise<InternalChatGroupParticipant[]> {
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
        .where(eq(internalChatConversationMembers.conversationId, conversationId))
        .all();

      return sortParticipantsBySelfFirst(
        rows,
        accountId,
      );
    } catch (err) {
      logInternalChatError('listGroupMembersOrDmPeersByAccount', err, {
        accountId,
        conversationId,
      });
      throw err;
    }
  }

  return {
    createChatGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    changeChatGroup,
    listChatGroups,
    listGroupMembers,
    listGroupMembersByAccount,
    listGroupMembersOrDmPeersByAccount,
    requireConversationMembership,
    requireConversationMembershipByAccount,
    getRequiredConversationForAgent,
    getRequiredConversationForAccount,
    getRequiredGroupForAgent,
    getRequiredGroupForAccount,
  };
}

export type InternalChatGroups = ReturnType<typeof createInternalChatGroups>;
