import type { InternalChatAccount, InternalChatConversationMember, NewInternalChatConversationMember } from '../database/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
} from '../database/schema';

/**
 * internal-chat-group-helpers.ts
 *
 * Extracted from internal-chat-groups.ts (changeChatGroup, #2581).
 * Each function corresponds to one discrete sub-concern within the
 * group create/update flow.
 */
import { createId } from '../utils/id';

export type ResolvedGroupMember = {
  accountId: string;
  participantKey: string;
  participantSlug: string;
  participantName: string;
  role: string;
};

/**
 * Resolves participant keys to account records and builds the desired member map.
 * Actor account is always included as admin.
 */
export async function resolveChatGroupMembers(
  db: Database,
  members: Array<{ participantKey: string; role?: string }>,
  actorAccount: { id: string; agentId: string | null; slug: string; displayName: string },
): Promise<Map<string, ResolvedGroupMember>> {
  const desiredMembers = new Map<string, ResolvedGroupMember>();

  for (const member of members) {
    const participant = (await db.query.internalChatAccounts.findFirst({
      where: eq(
        sql`coalesce(${internalChatAccounts.agentId}, ${internalChatAccounts.slug})` as any,
        member.participantKey,
      ),
    })) as InternalChatAccount;

    if (participant === null || participant === undefined) {
      throw new Error(`Internal chat participant not found: ${member.participantKey}`);
    }

    desiredMembers.set(participant.id, {
      accountId: participant.id,
      participantKey: participant.agentId ?? participant.slug,
      participantSlug: participant.slug,
      participantName: participant.displayName,
      role: member.role ?? 'normal',
    });
  }

  // Actor is always admin
  desiredMembers.set(actorAccount.id, {
    accountId: actorAccount.id,
    participantKey: actorAccount.agentId ?? actorAccount.slug,
    participantSlug: actorAccount.slug,
    participantName: actorAccount.displayName,
    role: 'admin',
  });

  return desiredMembers;
}

/**
 * Creates the group conversation + initial admin membership in a transaction.
 * Throws if group already exists (input.groupId was provided).
 */
export async function createChatGroupIfNeeded(
  tx: Database,
  groupId: string,
  name: string | undefined,
  actorAccount: { id: string },
  now: number,
): Promise<void> {
  await tx.insert(internalChatConversations).values({
    id: groupId,
    type: 'group',
    name,
    createdByAccountId: actorAccount.id,
    createdAt: now,
    updatedAt: now,
  });

  await tx.insert(internalChatConversationMembers).values({
    conversationId: groupId,
    accountId: actorAccount.id,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  } as NewInternalChatConversationMember);
}

/**
 * Updates the group display name within a transaction.
 */
export async function updateChatGroupName(
  tx: Database,
  groupId: string,
  name: string,
  now: number,
): Promise<void> {
  await tx
    .update(internalChatConversations)
    .set({ name, updatedAt: now })
    .where(eq(internalChatConversations.id, groupId));
}

/**
 * Syncs membership: removes members not in desiredMembers,
 * adds new members, promotes/demotes roles where changed.
 * Updates the conversation updatedAt timestamp when done.
 */
export async function syncChatGroupMembers(
  tx: Database,
  groupId: string,
  desiredMembers: Map<string, ResolvedGroupMember>,
  now: number,
): Promise<void> {
  const existingMembers = (await tx.query.internalChatConversationMembers.findMany({
    where: eq(internalChatConversationMembers.conversationId, groupId),
  })) as InternalChatConversationMember[];

  const existingByAccountId = new Map(existingMembers.map((m: any) => [m.accountId, m]));

  // Remove members not in desired set
  for (const existingMember of existingMembers) {
    if (!desiredMembers.has(existingMember.accountId)) {
      await tx
        .delete(internalChatConversationMembers)
        .where(
          and(
            eq(internalChatConversationMembers.conversationId, groupId),
            eq(internalChatConversationMembers.accountId, existingMember.accountId),
          ),
        );
    }
  }

  // Add new members / update roles
  for (const desiredMember of desiredMembers.values()) {
    const existingMember = existingByAccountId.get(desiredMember.accountId);

    if (existingMember === null || existingMember === undefined) {
      await tx.insert(internalChatConversationMembers).values({
        conversationId: groupId,
        accountId: desiredMember.accountId,
        role: desiredMember.role,
        createdAt: now,
        updatedAt: now,
      } as NewInternalChatConversationMember);
      if (existingMember.role !== desiredMember.role)
        await tx
          .update(internalChatConversationMembers)
          .set({ role: desiredMember.role })
          .where(
            and(
              eq(internalChatConversationMembers.conversationId, groupId),
              eq(internalChatConversationMembers.accountId, desiredMember.accountId),
            ),
          );
    }
  }

  // Touch updatedAt so conversation appears active
  await tx
    .update(internalChatConversations)
    .set({ updatedAt: now })
    .where(eq(internalChatConversations.id, groupId));
}

/** Generates a group id when one is not provided. */
export function generateGroupId(): string {
  return `grp_${createId()}`;
}
