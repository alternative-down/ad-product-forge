import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { forgeDebug } from "@forge-runtime/core";
import { createId } from "../utils/id";
import {
  buildGroupRow,
  buildGroupMemberViews,
  sortParticipantsBySelfFirst,
  type InternalChatGroupMember,
  type InternalChatGroupParticipant,
  type InternalChatGroupRow,
} from "./internal-chat-helpers";
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
} from "../database/schema";
import type {Database} from "../database/client"

export interface CreateChatGroupInput {
  agentId: string;
  conversationKey: string;
  name: string;
  creatorName: string;
}

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
    role?: "admin" | "normal";
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

  async function getRequiredConversationForAgent(
    agentId: string,
    conversationId: string,
  ) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return getRequiredConversationForAccount(account.id, conversationId);
  }

  async function getRequiredConversationForAccount(
    accountId: string,
    conversationId: string,
  ) {
    await requireConversationMembershipByAccount(accountId, conversationId);

    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });

    if (!conversation) {
      forgeDebug({ scope: 'internal-chat-groups', level: 'warn', message: 'getRequiredConversationForAccount conversation not found', context: { conversationId } });
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return conversation;
  }

  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const group = await getRequiredConversationForAgent(agentId, groupId);

    if (group.type !== "group") {
      forgeDebug({ scope: 'internal-chat-groups', level: 'warn', message: 'getRequiredGroupForAgent type check failed', context: { groupId } });
      throw new Error(`Chat group not found: ${groupId}`);
    }

    return group;
  }

  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const group = await getRequiredConversationForAccount(accountId, groupId);

    if (group.type !== "group") {
      forgeDebug({ scope: 'internal-chat-groups', level: 'warn', message: 'getRequiredGroupForAccount type check failed', context: { groupId } });
      throw new Error(`Chat group not found: ${groupId}`);
    }

    return group;
  }

  async function requireConversationMembership(
    agentId: string,
    conversationId: string,
  ) {
    const account = await deps.getRequiredAgentAccount(agentId);
    return requireConversationMembershipByAccount(account.id, conversationId);
  }

  async function requireConversationMembershipByAccount(
    accountId: string,
    conversationId: string,
  ) {
    const membership =
      await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, accountId),
          eq(internalChatConversationMembers.conversationId, conversationId),
        ),
      });

    if (!membership) {
      forgeDebug({ scope: 'internal-chat-groups', level: 'warn', message: 'requireConversationMembershipByAccount membership not found', context: { conversationId } });
      throw new Error(`Conversation not found: ${conversationId}`);
    }
  }

  // -----------------------------------------------------------------------
  // Public API — group CRUD
  // -----------------------------------------------------------------------

  async function createChatGroup(input: CreateChatGroupInput) {
    { try {
    const existing = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, input.conversationKey),
    });

    if (existing) {
      throw new Error(`Chat group already exists: ${input.conversationKey}`);
    }

    const now = Date.now();
    const creatorAccount = await deps.getRequiredAgentAccount(input.agentId);

    await db.insert(internalChatConversations).values({
      id: input.conversationKey,
      type: "group",
      name: input.name,
      createdByAccountId: creatorAccount.id,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(internalChatConversationMembers).values({
      conversationId: input.conversationKey,
      accountId: creatorAccount.id,
      role: "admin",
      createdAt: now,
    });

    return {
      groupId: input.conversationKey,
      name: input.name,
      provider: "internal-chat",
      conversationKey: input.conversationKey,
      creatorMember: {
        participantId: creatorAccount.id,
        participantName: input.creatorName,
        role: "admin",
      },
      createdAt: new Date(now).toISOString(),
    };
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `createChatGroup failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { conversationKey: input.conversationKey, agentId: input.agentId },
      });
      throw err;
    }
  } }

  async function addMemberToGroup(input: AddMemberToGroupInput) {
    { try {
    const group = await getRequiredGroupForAgent(input.agentId, input.groupId);
    const participant = await deps.getRequiredAccountBySlug(input.participantSlug);
    const now = Date.now();

    const existing = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.conversationId, group.id),
        eq(internalChatConversationMembers.accountId, participant.id),
      ),
    });

    if (existing) {
      throw new Error(`Group member already exists: ${input.participantSlug}`);
    }

    await db.insert(internalChatConversationMembers).values({
      conversationId: group.id,
      accountId: participant.id,
      role: input.role ?? "normal",
      createdAt: now,
    });

    return {
      groupId: group.id,
      participantSlug: participant.slug,
      participantId: participant.id,
      participantName: participant.displayName,
      role: input.role ?? "normal",
      createdAt: new Date(now).toISOString(),
    };
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) throw err;
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `addMemberToGroup failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { groupId: input.groupId, agentId: input.agentId, participantSlug: input.participantSlug },
      });
      throw err;
    }
  } }

  async function removeMemberFromGroup(input: RemoveMemberFromGroupInput) {
    { try {
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
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `removeMemberFromGroup failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { groupId: input.groupId, agentId: input.agentId, participantSlug: input.participantSlug },
      });
      throw err;
    }
  } }

  async function changeChatGroup(input: ChangeChatGroupInput) {
    { try {
    const actorAccount = await deps.getRequiredAgentAccount(input.agentId);
    const now = Date.now();
    const groupId = input.groupId ?? `grp_${createId()}`;

    let desiredMembers: Map<
      string,
      {
        accountId: string;
        participantKey: string;
        participantSlug: string;
        participantName: string;
        role: string;
      }
    > | null = null;

    if (input.members) {
      desiredMembers = new Map<
        string,
        {
          accountId: string;
          participantKey: string;
          participantSlug: string;
          participantName: string;
          role: string;
        }
      >();

      for (const member of input.members) {
        const participant = await db.query.internalChatAccounts.findFirst({
          where: eq(
            sql`coalesce(${internalChatAccounts.agentId}, ${internalChatAccounts.slug})`,
            member.participantKey,
          ),
        });

        if (!participant) {
          throw new Error(
            `Internal chat participant not found: ${member.participantKey}`,
          );
        }

        desiredMembers.set(participant.id, {
          accountId: participant.id,
          participantKey: participant.agentId ?? participant.slug,
          participantSlug: participant.slug,
          participantName: participant.displayName,
          role: member.role ?? "normal",
        });
      }

      desiredMembers.set(actorAccount.id, {
        accountId: actorAccount.id,
        participantKey: actorAccount.agentId ?? actorAccount.slug,
        participantSlug: actorAccount.slug,
        participantName: actorAccount.displayName,
        role: "admin",
      });
    }

    if (input.groupId) {
      await getRequiredGroupForAgent(input.agentId, groupId);

      const membership =
        await db.query.internalChatConversationMembers.findFirst({
          where: and(
            eq(internalChatConversationMembers.conversationId, groupId),
            eq(internalChatConversationMembers.accountId, actorAccount.id),
          ),
        });

      if (!membership || membership.role !== "admin") {
        throw new Error("Only admins can update the group.");
      }
    } else {
      if (!input.name) {
        throw new Error("name is required when creating a group.");
      }
    }

    await db.transaction(async (tx) => {
      if (!input.groupId) {
        await tx.insert(internalChatConversations).values({
          id: groupId,
          type: "group",
          name: input.name,
          createdByAccountId: actorAccount.id,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(internalChatConversationMembers).values({
          conversationId: groupId,
          accountId: actorAccount.id,
          role: "admin",
          createdAt: now,
        });
      }

      if (input.name !== undefined) {
        await tx
          .update(internalChatConversations)
          .set({
            name: input.name,
            updatedAt: now,
          })
          .where(eq(internalChatConversations.id, groupId));
      }

      if (!desiredMembers) {
        return;
      }

      const existingMembers = await tx.query.internalChatConversationMembers.findMany(
        {
          where: eq(
            internalChatConversationMembers.conversationId,
            groupId,
          ),
        },
      );
      const existingByAccountId = new Map(
        existingMembers.map((member) => [member.accountId, member]),
      );

      for (const existingMember of existingMembers) {
        if (!desiredMembers.has(existingMember.accountId)) {
          await tx
            .delete(internalChatConversationMembers)
            .where(
              and(
                eq(
                  internalChatConversationMembers.conversationId,
                  groupId,
                ),
                eq(
                  internalChatConversationMembers.accountId,
                  existingMember.accountId,
                ),
              ),
            );
        }
      }

      for (const desiredMember of desiredMembers.values()) {
        const existingMember = existingByAccountId.get(
          desiredMember.accountId,
        );

        if (!existingMember) {
          await tx
            .insert(internalChatConversationMembers)
            .values({
              conversationId: groupId,
              accountId: desiredMember.accountId,
              role: desiredMember.role,
              createdAt: now,
            });
        } else if (existingMember.role !== desiredMember.role) {
          await tx
            .update(internalChatConversationMembers)
            .set({
              role: desiredMember.role,
            })
            .where(
              and(
                eq(
                  internalChatConversationMembers.conversationId,
                  groupId,
                ),
                eq(
                  internalChatConversationMembers.accountId,
                  desiredMember.accountId,
                ),
              ),
            );
        }
      }

      await tx
        .update(internalChatConversations)
        .set({ updatedAt: now })
        .where(eq(internalChatConversations.id, groupId));
    });

    return {
      groupId,
      provider: "internal-chat",
      conversationKey: groupId,
    };
    } catch (err) {
      if (err instanceof Error && (err.message.includes('not found') || err.message.includes('Admin permission'))) throw err;
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `changeChatGroup failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { groupId: input.groupId, agentId: input.agentId },
      });
      throw err;
    }
  } }

  async function listChatGroups(input: ListChatGroupsInput) {
    { try {
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
        eq(
          internalChatConversationMembers.conversationId,
          internalChatConversations.id,
        ),
      )
      .where(
        and(
          eq(internalChatConversations.type, "group"),
          eq(internalChatConversationMembers.accountId, agentAccount.id),
        ),
      )
      .orderBy(desc(internalChatConversations.updatedAt))
      .limit(input.limit)
      .all();

    return rows.map((row) => buildGroupRow(row satisfies InternalChatGroupRow));
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `listChatGroups failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId: input.agentId, limit: input.limit },
      });
      throw err;
    }
  } }

  async function listGroupMembers(input: ListGroupMembersInput) {
    { try {
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
      .where(
        eq(internalChatConversationMembers.conversationId, input.groupId),
      );

    return rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) throw err;
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `listGroupMembers failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { groupId: input.groupId, agentId: input.agentId },
      });
      throw err;
    }
  } }

  async function listGroupMembersByAccount(
    input: ListGroupMembersByAccountInput,
  ): Promise<InternalChatGroupMember[]> {
    { try {
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
      .where(
        eq(internalChatConversationMembers.conversationId, input.groupId),
      );

    return rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) throw err;
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `listGroupMembersByAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { groupId: input.groupId, accountId: input.accountId },
      });
      throw err;
    }
  } }

  async function listGroupMembersOrDmPeersByAccount(
    accountId: string,
    conversationId: string,
  ): Promise<InternalChatGroupParticipant[]> {
    { try {
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
      .where(
        eq(internalChatConversationMembers.conversationId, conversationId),
      );

    return sortParticipantsBySelfFirst(rows, accountId);
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-groups',
        level: 'error',
        message: `listGroupMembersOrDmPeersByAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { accountId, conversationId },
      });
      throw err;
    }
  } }

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
