import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lte, ne, sql } from 'drizzle-orm';
import path from 'node:path';
import { customAlphabet } from 'nanoid';

import type {
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/index';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import { createId } from '../utils/id';

type InternalChatHandler = (message: CommunicationInboundMessage) => Promise<void> | void;

const createSlugSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

function parseFilterDate(value: string | undefined, fieldName: string) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  return parsed;
}

type InternalChatGroupMember = {
  groupId: string;
  participantId: string;
  participantKey: string;
  participantSlug: string;
  participantName: string;
  role: string;
  createdAt: string;
};

function createInternalChatSlug(displayName: string) {
  const baseSlug = displayName
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'agent';

  return `${baseSlug}-${createSlugSuffix()}`;
}

function sanitizeAttachmentName(fileName: string) {
  const value = fileName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();

  return value || 'attachment';
}

function resolveContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.json') return 'application/json';
  if (extension === '.txt' || extension === '.md') return 'text/plain';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.mp4') return 'video/mp4';

  return undefined;
}

function buildAgentAccountDescription(input: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
}) {
  return [
    `Agent id: ${input.agentId}`,
    `Agent name: ${input.agentName}`,
    input.agentDescription?.trim() ? `Agent description: ${input.agentDescription.trim()}` : null,
    input.roleName?.trim() ? `Role name: ${input.roleName.trim()}` : null,
    input.roleDescription?.trim() ? `Role description: ${input.roleDescription.trim()}` : null,
  ].filter(Boolean).join('\n');
}

export function createInternalChatService(
  db: Database,
) {
  const handlers = new Map<string, InternalChatHandler>();

  async function storeMessageAttachments(messageId: string, attachments: CommunicationFile[]) {
    if (attachments.length === 0) {
      return;
    }

    await db.insert(internalChatMessageAttachments).values(
      attachments.map((attachment, index) => ({
        id: createId(),
        messageId,
        attachmentIndex: index,
        name: sanitizeAttachmentName(attachment.name),
        contentType: attachment.contentType ?? null,
        sizeBytes: attachment.sizeBytes ?? attachment.data.byteLength,
        data: Buffer.from(attachment.data),
        createdAt: Date.now(),
      })),
    );
  }

  async function readMessageAttachments(messageId: string): Promise<CommunicationFile[]> {
    const rows = await db.query.internalChatMessageAttachments.findMany({
      where: eq(internalChatMessageAttachments.messageId, messageId),
      orderBy: (table, { asc }) => [asc(table.attachmentIndex)],
    });

    return rows.map((row) => ({
      name: row.name,
      data: new Uint8Array(row.data),
      contentType: row.contentType ?? resolveContentType(row.name),
      sizeBytes: row.sizeBytes,
    }));
  }

  async function readMessageAttachment(messageId: string, attachmentName: string): Promise<CommunicationFile | null> {
    const attachments = await readMessageAttachments(messageId);
    return attachments.find((attachment) => attachment.name === attachmentName) ?? null;
  }

  async function registerAgentAccount(input: {
    agentId: string;
    displayName: string;
    agentName: string;
    agentDescription?: string;
    roleName?: string;
    roleDescription?: string;
  }) {
    const now = Date.now();
    const description = buildAgentAccountDescription({
      agentId: input.agentId,
      agentName: input.agentName,
      agentDescription: input.agentDescription,
      roleName: input.roleName,
      roleDescription: input.roleDescription,
    });
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, input.agentId),
    });

    if (existing) {
      await db
        .update(internalChatAccounts)
        .set({
          displayName: input.displayName,
          description,
          updatedAt: now,
        })
        .where(eq(internalChatAccounts.agentId, input.agentId));

      return {
        accountId: existing.id,
        agentId: input.agentId,
        slug: existing.slug,
        displayName: input.displayName,
        description,
      };
    }

    const slug = createInternalChatSlug(input.displayName);
    const accountId = `acct_${createId()}`;

    await db.insert(internalChatAccounts).values({
      id: accountId,
      agentId: input.agentId,
      slug,
      displayName: input.displayName,
      description,
      createdAt: now,
      updatedAt: now,
    });

    // Create DM conversations with all existing agent accounts
    const existingAgentAccounts = await db.query.internalChatAccounts.findMany({
      where: and(
        isNotNull(internalChatAccounts.agentId),
        ne(internalChatAccounts.agentId, input.agentId),
      ),
    });

    for (const existing of existingAgentAccounts) {
      await ensureDirectConversation(accountId, existing.id);
    }

    return {
      accountId,
      agentId: input.agentId,
      slug,
      displayName: input.displayName,
      description,
    };
  }

  async function registerExternalAccount(input: {
    slug: string;
    displayName: string;
    description?: string;
  }) {
    const now = Date.now();
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, input.slug),
    });

    if (existing) {
      await db
        .update(internalChatAccounts)
        .set({
          displayName: input.displayName,
          description: input.description ?? null,
          updatedAt: now,
        })
        .where(eq(internalChatAccounts.id, existing.id));

      return {
        accountId: existing.id,
        slug: existing.slug,
        displayName: input.displayName,
        description: input.description,
      };
    }

    const accountId = `acct_${createId()}`;

    await db.insert(internalChatAccounts).values({
      id: accountId,
      agentId: null,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      accountId,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
    };
  }

  async function updateExternalAccount(input: {
    accountId: string;
    slug: string;
    displayName: string;
    description?: string;
  }) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, input.accountId),
    });

    if (!account || account.agentId) {
      throw new Error(`External account not found: ${input.accountId}`);
    }

    const existingWithSlug = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, input.slug),
    });

    if (existingWithSlug && existingWithSlug.id !== input.accountId) {
      throw new Error(`Internal chat account slug already exists: ${input.slug}`);
    }

    const now = Date.now();

    await db
      .update(internalChatAccounts)
      .set({
        slug: input.slug,
        displayName: input.displayName,
        description: input.description ?? null,
        updatedAt: now,
      })
      .where(eq(internalChatAccounts.id, input.accountId));

    return {
      accountId: input.accountId,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
    };
  }

  async function deleteExternalAccount(input: { accountId: string }) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, input.accountId),
    });

    if (!account || account.agentId) {
      throw new Error(`External account not found: ${input.accountId}`);
    }

    await db
      .delete(internalChatAccounts)
      .where(eq(internalChatAccounts.id, input.accountId));

    return {
      accountId: input.accountId,
      deleted: true,
    };
  }

  function onReceiveMessage(agentId: string, handler: InternalChatHandler) {
    const hadHandler = handlers.has(agentId);
    handlers.set(agentId, handler);

    if (hadHandler) {
      return;
    }

    void replayUnreadMessages(agentId, handler).catch((error) => {
      forgeDebug({ scope: 'internal-chat', level: 'error', agentId, message: 'Failed to replay unread messages', context: { error } });
    });
  }

  function clearHandler(agentId: string, handler?: InternalChatHandler) {
    if (!handler) {
      handlers.delete(agentId);
      return;
    }

    if (handlers.get(agentId) !== handler) {
      return;
    }

    handlers.delete(agentId);
  }

  async function listAccounts(input: { excludeAgentId?: string } = {}) {
    const rows = await db.query.internalChatAccounts.findMany({
      orderBy: (fields, { asc }) => [asc(fields.displayName)],
    });

    return rows.filter((row) => row.agentId !== input.excludeAgentId);
  }

  async function getAccountBySlug(slug: string) {
    return db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, slug),
    });
  }

  async function getAccountByAgentId(agentId: string) {
    return db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
  }

  async function getAccountByTargetKey(targetKey: string) {
    return await getAccountByAgentId(targetKey) ?? await getAccountBySlug(targetKey);
  }

  async function getConversationForAgent(agentId: string, conversationId: string) {
    const account = await getRequiredAgentAccount(agentId);
    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.accountId, account.id),
        eq(internalChatConversationMembers.conversationId, conversationId),
      ),
    });

    if (!membership) {
      return null;
    }

    return db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
  }

  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    const rows = await db
      .select({
        conversationId: internalChatConversationMembers.conversationId,
      })
      .from(internalChatConversationMembers)
      .where(inArray(internalChatConversationMembers.accountId, [leftAccountId, rightAccountId]));

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

      if (existing) {
        return existing;
      }
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
      {
        conversationId,
        accountId: leftAccountId,
        role: 'normal',
        createdAt: now,
      },
      {
        conversationId,
        accountId: rightAccountId,
        role: 'normal',
        createdAt: now,
      },
    ]);

    return db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
  }

  async function createChatGroup(input: {
    agentId: string;
    conversationKey: string;
    name: string;
    creatorName: string;
  }) {
    const existing = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, input.conversationKey),
    });

    if (existing) {
      throw new Error(`Chat group already exists: ${input.conversationKey}`);
    }

    const now = Date.now();
    const creatorAccount = await getRequiredAgentAccount(input.agentId);

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
        participantName: input.creatorName,
        role: 'admin',
      },
      createdAt: new Date(now).toISOString(),
    };
  }

  async function addMemberToGroup(input: {
    agentId: string;
    groupId: string;
    participantSlug: string;
    role?: string;
  }) {
    const group = await getRequiredGroupForAgent(input.agentId, input.groupId);
    const participant = await getRequiredAccountBySlug(input.participantSlug);
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
      role: input.role ?? 'normal',
      createdAt: now,
    });

    return {
      groupId: group.id,
      participantSlug: participant.slug,
      participantId: participant.id,
      participantName: participant.displayName,
      role: input.role ?? 'normal',
      createdAt: new Date(now).toISOString(),
    };
  }

  async function removeMemberFromGroup(input: {
    agentId: string;
    groupId: string;
    participantSlug: string;
  }) {
    await getRequiredGroupForAgent(input.agentId, input.groupId);
    const participant = await getRequiredAccountBySlug(input.participantSlug);

    await db
      .delete(internalChatConversationMembers)
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.groupId),
        eq(internalChatConversationMembers.accountId, participant.id),
      ));

    return {
      success: true,
      groupId: input.groupId,
      participantSlug: participant.slug,
    };
  }

  async function changeChatGroup(input: {
    agentId: string;
    groupId?: string;
    name?: string;
    members?: Array<{
      participantKey: string;
      role?: 'admin' | 'normal';
    }>;
  }) {
    const actorAccount = await getRequiredAgentAccount(input.agentId);
    const now = Date.now();
    const groupId = input.groupId ?? `grp_${createId()}`;
    let desiredMembers: Map<string, {
      accountId: string;
      participantKey: string;
      participantSlug: string;
      participantName: string;
      role: string;
    }> | null = null;

    if (input.members) {
      desiredMembers = new Map<string, { accountId: string; participantKey: string; participantSlug: string; participantName: string; role: string }>();

      for (const member of input.members) {
        const participant = await getAccountByTargetKey(member.participantKey);

        if (!participant) {
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

      desiredMembers.set(actorAccount.id, {
        accountId: actorAccount.id,
        participantKey: actorAccount.agentId ?? actorAccount.slug,
        participantSlug: actorAccount.slug,
        participantName: actorAccount.displayName,
        role: 'admin',
      });
    }

    if (input.groupId) {
      await getRequiredGroupForAgent(input.agentId, groupId);
      const membership = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.conversationId, groupId),
          eq(internalChatConversationMembers.accountId, actorAccount.id),
        ),
      });

      if (!membership || membership.role !== 'admin') {
        throw new Error('Only admins can update the group.');
      }
    } else {
      if (!input.name) {
        throw new Error('name is required when creating a group.');
      }
    }

    await db.transaction(async (tx) => {
      if (!input.groupId) {
        await tx.insert(internalChatConversations).values({
          id: groupId,
          type: 'group',
          name: input.name,
          createdByAccountId: actorAccount.id,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(internalChatConversationMembers).values({
          conversationId: groupId,
          accountId: actorAccount.id,
          role: 'admin',
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

      const existingMembers = await tx.query.internalChatConversationMembers.findMany({
        where: eq(internalChatConversationMembers.conversationId, groupId),
      });
      const existingByAccountId = new Map(existingMembers.map((member) => [member.accountId, member]));

      for (const existingMember of existingMembers) {
        if (!desiredMembers.has(existingMember.accountId)) {
          await tx
            .delete(internalChatConversationMembers)
            .where(and(
              eq(internalChatConversationMembers.conversationId, groupId),
              eq(internalChatConversationMembers.accountId, existingMember.accountId),
            ));
        }
      }

      for (const desiredMember of desiredMembers.values()) {
        const existingMember = existingByAccountId.get(desiredMember.accountId);

        if (!existingMember) {
          await tx.insert(internalChatConversationMembers).values({
            conversationId: groupId,
            accountId: desiredMember.accountId,
            role: desiredMember.role,
            createdAt: now,
          });
          continue;
        }

        if (existingMember.role !== desiredMember.role) {
          await tx
            .update(internalChatConversationMembers)
            .set({
              role: desiredMember.role,
            })
            .where(and(
              eq(internalChatConversationMembers.conversationId, groupId),
              eq(internalChatConversationMembers.accountId, desiredMember.accountId),
            ));
        }
      }

      await tx
        .update(internalChatConversations)
        .set({
          updatedAt: now,
        })
        .where(eq(internalChatConversations.id, groupId));
    });

    const group = await getRequiredGroupForAgent(input.agentId, groupId);
    const members = await listGroupMembers({
      agentId: input.agentId,
      groupId,
    });

    return {
      groupId,
      name: group.name ?? groupId,
      provider: 'internal-chat',
      conversationKey: groupId,
      members: members.map((member) => ({
        participantId: member.participantId,
        participantKey: member.participantKey,
        participantSlug: member.participantSlug,
        participantName: member.participantName,
        role: member.role,
      })),
      createdAt: new Date(group.createdAt).toISOString(),
      updatedAt: new Date(group.updatedAt).toISOString(),
    };
  }

  async function listChatGroups(input: {
    agentId: string;
    limit: number;
  }) {
    const agentAccount = await getRequiredAgentAccount(input.agentId);
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
      .where(and(
        eq(internalChatConversations.type, 'group'),
        eq(internalChatConversationMembers.accountId, agentAccount.id),
      ))
      .orderBy(desc(internalChatConversations.updatedAt))
      .limit(input.limit);

    return rows.map((row) => ({
      groupId: row.id,
      name: row.name ?? row.id,
      provider: 'internal-chat',
      conversationKey: row.id,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async function listGroupMembers(input: { agentId: string; groupId: string }): Promise<InternalChatGroupMember[]> {
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
      .where(eq(internalChatConversationMembers.conversationId, input.groupId));

    return rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  async function listGroupMembersByAccount(input: {
    accountId: string;
    groupId: string;
  }): Promise<InternalChatGroupMember[]> {
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
      .where(eq(internalChatConversationMembers.conversationId, input.groupId));

    return rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  async function listConversations(input: {
    agentId: string;
    unread?: boolean;
    limit: number;
  }): Promise<CommunicationProviderConversation[]> {
    const agentAccount = await getRequiredAgentAccount(input.agentId);
    const conversationRows = await db
      .select({
        id: internalChatConversations.id,
        name: internalChatConversations.name,
        type: internalChatConversations.type,
        updatedAt: internalChatConversations.updatedAt,
      })
      .from(internalChatConversations)
      .innerJoin(
        internalChatConversationMembers,
        eq(internalChatConversationMembers.conversationId, internalChatConversations.id),
      )
      .where(eq(internalChatConversationMembers.accountId, agentAccount.id))
      .orderBy(desc(internalChatConversations.updatedAt))
      .limit(input.limit);

    const conversationIds = conversationRows.map((row) => row.id);

    if (conversationIds.length === 0) {
      return [];
    }

    const messageRows = await db
      .select({
        conversationId: internalChatMessages.conversationId,
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
        unread: sql<number>`case when ${internalChatMessageReads.readAt} is null then 1 else 0 end`,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatMessageReads,
        and(
          eq(internalChatMessageReads.messageId, internalChatMessages.id),
          eq(internalChatMessageReads.agentId, input.agentId),
        ),
      )
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(inArray(internalChatMessages.conversationId, conversationIds))
      .orderBy(desc(internalChatMessages.createdAt));

    const messageIdsToMarkRead = new Set<string>();

    const messagesByConversationId = new Map<string, CommunicationProviderMessage[]>();
    const unreadCountByConversationId = new Map<string, number>();

    for (const row of messageRows) {
      unreadCountByConversationId.set(
        row.conversationId,
        (unreadCountByConversationId.get(row.conversationId) ?? 0) + (row.unread ? 1 : 0),
      );

      const existing = messagesByConversationId.get(row.conversationId) ?? [];
      const shouldIncludeMessage = input.unread ? row.unread === 1 : true;

      if (shouldIncludeMessage && existing.length < 5) {
        existing.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: row.conversationId,
          content: row.content,
          attachments: await readMessageAttachments(row.messageId),
          unread: row.unread === 1,
          createdAt: new Date(row.createdAt).toISOString(),
          authorDisplayName: row.authorDisplayName,
        });

        if (row.unread === 1) {
          messageIdsToMarkRead.add(row.messageId);
        }
      }

      messagesByConversationId.set(row.conversationId, existing);
    }

    if (messageIdsToMarkRead.size > 0) {
      const now = Date.now();

      await db
        .update(internalChatMessageReads)
        .set({ readAt: now })
        .where(and(
          eq(internalChatMessageReads.agentId, input.agentId),
          inArray(internalChatMessageReads.messageId, Array.from(messageIdsToMarkRead)),
        ));
    }

    const views = await Promise.all(
      conversationRows.map(async (conversation) => {
        const participants = await listGroupMembersOrDmPeers(input.agentId, conversation.id);
        const conversationName = conversation.name
          ?? (
            participants.find((participant) => participant.accountId !== agentAccount.id)?.displayName
            ?? participants[0]?.displayName
          );

        return {
          targetKey: conversation.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conversation.updatedAt).toISOString(),
          unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
          name: conversationName,
          participants: participants.map((participant) => participant.displayName),
          messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
        };
      }),
    );

    if (!input.unread) {
      return views;
    }

    return views.filter((view) => view.unreadCount > 0);
  }

  async function listConversationsByAccount(input: {
    accountId: string;
    limit: number;
  }): Promise<CommunicationProviderConversation[]> {
    await getRequiredExternalAccount(input.accountId);

    const conversationRows = await db
      .select({
        id: internalChatConversations.id,
        name: internalChatConversations.name,
        type: internalChatConversations.type,
        updatedAt: internalChatConversations.updatedAt,
      })
      .from(internalChatConversations)
      .innerJoin(
        internalChatConversationMembers,
        eq(internalChatConversationMembers.conversationId, internalChatConversations.id),
      )
      .where(eq(internalChatConversationMembers.accountId, input.accountId))
      .orderBy(desc(internalChatConversations.updatedAt))
      .limit(input.limit);

    const conversationIds = conversationRows.map((row) => row.id);

    if (conversationIds.length === 0) {
      return [];
    }

    const messageRows = await db
      .select({
        conversationId: internalChatMessages.conversationId,
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(inArray(internalChatMessages.conversationId, conversationIds))
      .orderBy(desc(internalChatMessages.createdAt));

    const messagesByConversationId = new Map<string, CommunicationProviderMessage[]>();

    for (const row of messageRows) {
      const existing = messagesByConversationId.get(row.conversationId) ?? [];

      if (existing.length < 5) {
        existing.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: row.conversationId,
          content: row.content,
          attachments: await readMessageAttachments(row.messageId),
          unread: false,
          createdAt: new Date(row.createdAt).toISOString(),
          authorDisplayName: row.authorDisplayName,
        });
      }

      messagesByConversationId.set(row.conversationId, existing);
    }

    return Promise.all(
      conversationRows.map(async (conversation) => {
        const participants = await listGroupMembersOrDmPeersByAccount(input.accountId, conversation.id);
        const conversationName = conversation.name
          ?? (
            participants.find((participant) => participant.accountId !== input.accountId)?.displayName
            ?? participants[0]?.displayName
          );

        return {
          targetKey: conversation.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conversation.updatedAt).toISOString(),
          unreadCount: 0,
          name: conversationName,
          participants: participants.map((participant) => participant.displayName),
          messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
        };
      }),
    );
  }

  async function getMessages(input: {
    agentId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CommunicationProviderMessage[]> {
    await requireConversationMembership(input.agentId, input.conversationKey);
    const dateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const dateTo = parseFilterDate(input.dateTo, 'dateTo');
    const filters = [
      eq(internalChatMessages.conversationId, input.conversationKey),
      ...(input.query ? [like(internalChatMessages.content, `%${input.query}%`)] : []),
      ...(dateFrom !== null ? [gte(internalChatMessages.createdAt, dateFrom)] : []),
      ...(dateTo !== null ? [lte(internalChatMessages.createdAt, dateTo)] : []),
    ];

    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
        unread: sql<number>`case when ${internalChatMessageReads.readAt} is null then 1 else 0 end`,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatMessageReads,
        and(
          eq(internalChatMessageReads.messageId, internalChatMessages.id),
          eq(internalChatMessageReads.agentId, input.agentId),
        ),
      )
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit);

    const unreadMessageIds = rows.filter((row) => row.unread === 1).map((row) => row.messageId);

    if (unreadMessageIds.length > 0) {
      await db
        .update(internalChatMessageReads)
        .set({ readAt: Date.now() })
        .where(and(
          eq(internalChatMessageReads.agentId, input.agentId),
          inArray(internalChatMessageReads.messageId, unreadMessageIds),
        ));
    }

    return Promise.all(
      rows.reverse().map(async (row) => ({
        messageId: row.messageId,
        provider: 'internal-chat',
        authorId: row.authorAccountId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await readMessageAttachments(row.messageId),
        unread: row.unread === 1,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  async function getMessagesByAccount(input: {
    accountId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CommunicationProviderMessage[]> {
    await requireConversationMembershipByAccount(input.accountId, input.conversationKey);
    const dateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const dateTo = parseFilterDate(input.dateTo, 'dateTo');
    const filters = [
      eq(internalChatMessages.conversationId, input.conversationKey),
      ...(input.query ? [like(internalChatMessages.content, `%${input.query}%`)] : []),
      ...(dateFrom !== null ? [gte(internalChatMessages.createdAt, dateFrom)] : []),
      ...(dateTo !== null ? [lte(internalChatMessages.createdAt, dateTo)] : []),
    ];

    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit);

    return Promise.all(
      rows.reverse().map(async (row) => ({
        messageId: row.messageId,
        provider: 'internal-chat',
        authorId: row.authorAccountId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await readMessageAttachments(row.messageId),
        unread: false,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  async function createExternalChatGroup(input: {
    accountId: string;
    conversationKey: string;
    name: string;
  }) {
    const existing = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, input.conversationKey),
    });

    if (existing) {
      throw new Error(`Chat group already exists: ${input.conversationKey}`);
    }

    const creatorAccount = await getRequiredExternalAccount(input.accountId);
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
  }

  async function ensureDirectConversationByAccount(input: {
    accountId: string;
    participantAccountId: string;
  }) {
    await getRequiredExternalAccount(input.accountId);
    await getRequiredAccount(input.participantAccountId);

    const conversation = await ensureDirectConversation(input.accountId, input.participantAccountId);

    if (!conversation) {
      throw new Error('Failed to create direct conversation.');
    }

    return {
      conversationId: conversation.id,
      conversationKey: conversation.id,
    };
  }

  async function addMemberToGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role?: string;
  }) {
    const group = await getRequiredGroupForAccount(input.accountId, input.groupId);
    const participant = await getRequiredAccount(input.participantAccountId);
    const now = Date.now();

    const existing = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.conversationId, group.id),
        eq(internalChatConversationMembers.accountId, participant.id),
      ),
    });

    if (existing) {
      return listGroupMembersByAccount({
        accountId: input.accountId,
        groupId: input.groupId,
      });
    }

    await db.insert(internalChatConversationMembers).values({
      conversationId: group.id,
      accountId: participant.id,
      role: input.role ?? 'normal',
      createdAt: now,
    });

    return listGroupMembersByAccount({
      accountId: input.accountId,
      groupId: input.groupId,
    });
  }

  async function updateMemberRoleByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role: string;
  }) {
    await getRequiredGroupForAccount(input.accountId, input.groupId);

    await db
      .update(internalChatConversationMembers)
      .set({
        role: input.role,
      })
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.groupId),
        eq(internalChatConversationMembers.accountId, input.participantAccountId),
      ));

    return listGroupMembersByAccount({
      accountId: input.accountId,
      groupId: input.groupId,
    });
  }

  async function removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }) {
    await getRequiredGroupForAccount(input.accountId, input.groupId);

    await db
      .delete(internalChatConversationMembers)
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.groupId),
        eq(internalChatConversationMembers.accountId, input.participantAccountId),
      ));

    return listGroupMembersByAccount({
      accountId: input.accountId,
      groupId: input.groupId,
    });
  }

  async function updateGroupByAccount(input: {
    accountId: string;
    groupId: string;
    name: string;
  }) {
    await getRequiredGroupForAccount(input.accountId, input.groupId);
    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.conversationId, input.groupId),
        eq(internalChatConversationMembers.accountId, input.accountId),
      ),
    });

    if (!membership || membership.role !== 'admin') {
      throw new Error('Only admins can update the group.');
    }

    const now = Date.now();

    await db
      .update(internalChatConversations)
      .set({
        name: input.name,
        updatedAt: now,
      })
      .where(eq(internalChatConversations.id, input.groupId));

    return getRequiredGroupForAccount(input.accountId, input.groupId);
  }

  async function archiveConversationByAccount(input: {
    accountId: string;
    conversationId: string;
  }) {
    await getRequiredConversationForAccount(input.accountId, input.conversationId);

    await db
      .delete(internalChatConversationMembers)
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.conversationId),
        eq(internalChatConversationMembers.accountId, input.accountId),
      ));

    const remainingMembers = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, input.conversationId),
      limit: 1,
    });

    if (remainingMembers.length === 0) {
      await db
        .delete(internalChatConversations)
        .where(eq(internalChatConversations.id, input.conversationId));
    }

    return {
      conversationId: input.conversationId,
      archived: true,
    };
  }

  async function sendMessage(input: {
    accountId: string;
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
  }) {
    const directAccount = await getAccountByAgentId(input.targetKey) ?? await getAccountBySlug(input.targetKey);
    const conversation = directAccount
      ? await ensureDirectConversation(input.accountId, directAccount.id)
      : await getRequiredConversationForAccount(input.accountId, input.targetKey);

    if (!conversation) {
      throw new Error(`Conversation not found: ${input.targetKey}`);
    }

    const now = Date.now();
    const messageId = createId();
    const members = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, conversation.id),
    });

    await db.insert(internalChatMessages).values({
      id: messageId,
      conversationId: conversation.id,
      authorAccountId: input.accountId,
      content: input.content,
      replyToMessageId: null,
      createdAt: now,
    });
    await storeMessageAttachments(messageId, input.attachments);

    const memberAccounts = await Promise.all(
      members.map((member) => getRequiredAccount(member.accountId)),
    );
    const readRows = memberAccounts
      .filter((memberAccount) => memberAccount.agentId)
      .map((memberAccount) => ({
        messageId,
        agentId: memberAccount.agentId as string,
        readAt: memberAccount.id === input.accountId ? now : null,
      }));

    if (readRows.length > 0) {
      await db.insert(internalChatMessageReads).values(readRows);
    }

    await db
      .update(internalChatConversations)
      .set({
        updatedAt: now,
      })
      .where(eq(internalChatConversations.id, conversation.id));

    const author = await getRequiredAccount(input.accountId);
    const participants = await listGroupMembersOrDmPeersByAccount(input.accountId, conversation.id);

    const deliveries: Array<Promise<{ agentId: string; delivered: boolean }>> = [];

    for (const participant of participants) {
      if (participant.accountId === input.accountId || !participant.agentId) {
        continue;
      }

      const handler = handlers.get(participant.agentId);

      if (!handler) {
        continue;
      }

      deliveries.push(
        Promise.resolve(handler({
          targetKey: conversation.id,
          messageId,
          conversationName: conversation.name ?? (conversation.type === 'dm' ? author.displayName : undefined),
          authorId: author.id,
          authorDisplayName: author.displayName,
          authorUsername: author.slug,
          content: input.content,
          attachments: input.attachments,
          createdAt: new Date(now).toISOString(),
          metadata: {
            conversationType: conversation.type,
            groupMembers: conversation.type === 'group'
              ? participants.map((member) => ({
                  participantId: member.accountId,
                  agentId: member.agentId,
                  slug: member.slug,
                  displayName: member.displayName,
                }))
              : undefined,
          },
        })).then(() => ({
          agentId: participant.agentId as string,
          delivered: true,
        })),
      );
    }

    if (deliveries.length > 0) {
      const results = await Promise.allSettled(deliveries);
      const liveDeliveredAgentIds: string[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          liveDeliveredAgentIds.push(result.value.agentId);
          continue;
        }

        forgeDebug({ scope: 'internal-chat', level: 'warn', message: 'Failed to deliver live message to handler', context: { reason: result.reason } });
      }

      if (liveDeliveredAgentIds.length > 0) {
        await db
          .update(internalChatMessageReads)
          .set({
            readAt: now,
          })
          .where(and(
            eq(internalChatMessageReads.messageId, messageId),
            inArray(internalChatMessageReads.agentId, liveDeliveredAgentIds),
            isNull(internalChatMessageReads.readAt),
          ));
      }
    }

    return {
      success: true,
      messageId,
      conversationKey: conversation.id,
    };
  }

  async function getMessageAttachmentByAccount(input: {
    accountId: string;
    conversationId: string;
    messageId: string;
    attachmentName: string;
  }) {
    await getRequiredConversationForAccount(input.accountId, input.conversationId);

    const message = await db.query.internalChatMessages.findFirst({
      where: and(
        eq(internalChatMessages.id, input.messageId),
        eq(internalChatMessages.conversationId, input.conversationId),
      ),
    });

    if (!message) {
      throw new Error(`Message not found: ${input.messageId}`);
    }

    const attachment = await readMessageAttachment(input.messageId, input.attachmentName);

    if (!attachment) {
      throw new Error(`Attachment not found: ${input.attachmentName}`);
    }

    return attachment;
  }

  async function getUnreadSummary(agentId: string) {
    const rows = await db
      .select({
        unreadMessageCount: sql<number>`count(*)`,
        unreadConversationCount: sql<number>`count(distinct ${internalChatMessages.conversationId})`,
      })
      .from(internalChatMessageReads)
      .innerJoin(
        internalChatMessages,
        eq(internalChatMessages.id, internalChatMessageReads.messageId),
      )
      .where(and(
        eq(internalChatMessageReads.agentId, agentId),
        isNull(internalChatMessageReads.readAt),
      ));

    return {
      unreadMessageCount: rows[0]?.unreadMessageCount ?? 0,
      unreadConversationCount: rows[0]?.unreadConversationCount ?? 0,
    };
  }

  async function listRecentConversations(agentId: string, limit: number) {
    return listConversations({
      agentId,
      limit,
    });
  }

  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    const account = await getRequiredAgentAccount(agentId);
    return listGroupMembersOrDmPeersByAccount(account.id, conversationId);
  }

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

    return rows.sort((left, right) => {
      if (left.accountId === accountId) {
        return -1;
      }

      if (right.accountId === accountId) {
        return 1;
      }

      return left.displayName.localeCompare(right.displayName);
    });
  }

  async function getRequiredAccount(accountId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, accountId),
    });

    if (!account) {
      throw new Error(`Internal chat account not found: ${accountId}`);
    }

    return account;
  }

  async function getRequiredAgentAccount(agentId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });

    if (!account) {
      throw new Error(`Internal chat account not found for agent: ${agentId}`);
    }

    return account;
  }

  async function getRequiredExternalAccount(accountId: string) {
    const account = await getRequiredAccount(accountId);

    if (account.agentId) {
      throw new Error(`External internal chat account not found: ${accountId}`);
    }

    return account;
  }

  async function getRequiredAccountBySlug(slug: string) {
    const account = await getAccountBySlug(slug);

    if (!account) {
      throw new Error(`Internal chat participant not found: ${slug}`);
    }

    return account;
  }

  async function requireConversationMembership(agentId: string, conversationId: string) {
    const account = await getRequiredAgentAccount(agentId);
    return requireConversationMembershipByAccount(account.id, conversationId);
  }

  async function requireConversationMembershipByAccount(accountId: string, conversationId: string) {
    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.accountId, accountId),
        eq(internalChatConversationMembers.conversationId, conversationId),
      ),
    });

    if (!membership) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
  }

  async function getRequiredConversationForAgent(agentId: string, conversationId: string) {
    const account = await getRequiredAgentAccount(agentId);
    return getRequiredConversationForAccount(account.id, conversationId);
  }

  async function getRequiredConversationForAccount(accountId: string, conversationId: string) {
    await requireConversationMembershipByAccount(accountId, conversationId);

    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return conversation;
  }

  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const group = await getRequiredConversationForAgent(agentId, groupId);

    if (group.type !== 'group') {
      throw new Error(`Chat group not found: ${groupId}`);
    }

    return group;
  }

  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const group = await getRequiredConversationForAccount(accountId, groupId);

    if (group.type !== 'group') {
      throw new Error(`Chat group not found: ${groupId}`);
    }

    return group;
  }

  return {
    registerAgentAccount,
    registerExternalAccount,
    updateExternalAccount,
    deleteExternalAccount,
    onReceiveMessage,
    clearHandler,
    listAccounts,
    getAccountBySlug,
    getAccountByAgentId,
    getConversationForAgent,
    createChatGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    changeChatGroup,
    listChatGroups,
    listGroupMembers,
    listGroupMembersByAccount,
    listConversations,
    listConversationsByAccount,
    getMessages,
    getMessagesByAccount,
    sendMessage,
    getMessageAttachmentByAccount,
    createExternalChatGroup,
    ensureDirectConversationByAccount,
    addMemberToGroupByAccount,
    updateMemberRoleByAccount,
    removeMemberFromGroupByAccount,
    updateGroupByAccount,
    archiveConversationByAccount,
    getUnreadSummary,
    listRecentConversations,
  };

  async function replayUnreadMessages(agentId: string, handler: InternalChatHandler) {
    const unreadRows = await db
      .select({
        conversationId: internalChatMessages.conversationId,
        conversationName: internalChatConversations.name,
        conversationType: internalChatConversations.type,
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
        authorSlug: internalChatAccounts.slug,
      })
      .from(internalChatMessageReads)
      .innerJoin(
        internalChatMessages,
        eq(internalChatMessages.id, internalChatMessageReads.messageId),
      )
      .innerJoin(
        internalChatConversations,
        eq(internalChatConversations.id, internalChatMessages.conversationId),
      )
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(and(
        eq(internalChatMessageReads.agentId, agentId),
        isNull(internalChatMessageReads.readAt),
      ))
      .orderBy(internalChatMessages.createdAt);

    if (unreadRows.length === 0) {
      return;
    }

    const participantsByConversationId = new Map<
      string,
      Awaited<ReturnType<typeof listGroupMembersOrDmPeers>>
    >();

    for (const row of unreadRows) {
      let participants = participantsByConversationId.get(row.conversationId);

      if (!participants) {
        participants = await listGroupMembersOrDmPeers(agentId, row.conversationId);
        participantsByConversationId.set(row.conversationId, participants);
      }

      await handler({
        targetKey: row.conversationId,
        messageId: row.messageId,
        conversationName: row.conversationName
          ?? (
            row.conversationType === 'dm'
              ? row.authorDisplayName
              : undefined
          ),
        authorId: row.authorAccountId,
        authorDisplayName: row.authorDisplayName,
        authorUsername: row.authorSlug,
        content: row.content,
        attachments: await readMessageAttachments(row.messageId),
        createdAt: new Date(row.createdAt).toISOString(),
        metadata: {
          conversationType: row.conversationType,
          groupMembers: row.conversationType === 'group'
            ? participants.map((participant) => ({
                participantId: participant.accountId,
                agentId: participant.agentId,
                slug: participant.slug,
                displayName: participant.displayName,
              }))
            : undefined,
        },
      });
    }
  }
}

export type InternalChatService = ReturnType<typeof createInternalChatService>;
