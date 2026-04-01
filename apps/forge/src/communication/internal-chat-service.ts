import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { customAlphabet } from 'nanoid';

import type {
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from '@mastra-engine/core';

import type { Database } from '../database/index';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import { createId } from '../utils/id';

type InternalChatHandler = (message: CommunicationInboundMessage) => Promise<void> | void;

const createSlugSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

type InternalChatGroupMember = {
  groupId: string;
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

export function createInternalChatService(
  db: Database,
  config: {
    dataRoot: string;
  },
) {
  const handlers = new Map<string, InternalChatHandler>();
  const attachmentRoot = path.resolve(config.dataRoot, 'internal-chat', 'attachments');

  async function storeMessageAttachments(messageId: string, attachments: CommunicationFile[]) {
    if (attachments.length === 0) {
      return;
    }

    const messageDir = path.resolve(attachmentRoot, messageId);
    await fs.mkdir(messageDir, { recursive: true });

    await Promise.all(
      attachments.map(async (attachment, index) => {
        const fileName = `${index}-${sanitizeAttachmentName(attachment.name)}`;
        await fs.writeFile(path.resolve(messageDir, fileName), attachment.data);
      }),
    );
  }

  async function readMessageAttachments(messageId: string): Promise<CommunicationFile[]> {
    const messageDir = path.resolve(attachmentRoot, messageId);

    try {
      const entries = await fs.readdir(messageDir, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .sort((left, right) => left.name.localeCompare(right.name));

      return Promise.all(
        files.map(async (entry) => {
          const filePath = path.resolve(messageDir, entry.name);
          const [data, stats] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
          const [, ...nameParts] = entry.name.split('-');
          const name = nameParts.join('-') || entry.name;

          return {
            name,
            data: new Uint8Array(data),
            contentType: resolveContentType(name),
            sizeBytes: stats.size,
          };
        }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function registerAgentAccount(input: {
    agentId: string;
    displayName: string;
    description?: string;
  }) {
    const now = Date.now();
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, input.agentId),
    });

    if (existing) {
      await db
        .update(internalChatAccounts)
        .set({
          displayName: input.displayName,
          description: input.description ?? null,
          updatedAt: now,
        })
        .where(eq(internalChatAccounts.agentId, input.agentId));

      return {
        agentId: input.agentId,
        slug: existing.slug,
        displayName: input.displayName,
        description: input.description,
      };
    }

    const slug = createInternalChatSlug(input.displayName);

    await db.insert(internalChatAccounts).values({
      agentId: input.agentId,
      slug,
      displayName: input.displayName,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      agentId: input.agentId,
      slug,
      displayName: input.displayName,
      description: input.description,
    };
  }

  function onReceiveMessage(agentId: string, handler: InternalChatHandler) {
    handlers.set(agentId, handler);
  }

  function clearHandler(agentId: string) {
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

  async function getConversationForAgent(agentId: string, conversationId: string) {
    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.agentId, agentId),
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

  async function ensureDirectConversation(leftAgentId: string, rightAgentId: string) {
    const rows = await db
      .select({
        conversationId: internalChatConversationMembers.conversationId,
      })
      .from(internalChatConversationMembers)
      .where(inArray(internalChatConversationMembers.agentId, [leftAgentId, rightAgentId]));

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
    const conversationId = `conv_${createId()}`;

    await db.insert(internalChatConversations).values({
      id: conversationId,
      type: 'dm',
      name: null,
      createdByAgentId: leftAgentId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(internalChatConversationMembers).values([
      {
        conversationId,
        agentId: leftAgentId,
        role: 'normal',
        createdAt: now,
      },
      {
        conversationId,
        agentId: rightAgentId,
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

    await db.insert(internalChatConversations).values({
      id: input.conversationKey,
      type: 'group',
      name: input.name,
      createdByAgentId: input.agentId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(internalChatConversationMembers).values({
      conversationId: input.conversationKey,
      agentId: input.agentId,
      role: 'admin',
      createdAt: now,
    });

    return {
      groupId: input.conversationKey,
      name: input.name,
      provider: 'internal-chat',
      conversationKey: input.conversationKey,
      creatorMember: {
        participantId: input.agentId,
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
        eq(internalChatConversationMembers.agentId, participant.agentId),
      ),
    });

    if (existing) {
      throw new Error(`Group member already exists: ${input.participantSlug}`);
    }

    await db.insert(internalChatConversationMembers).values({
      conversationId: group.id,
      agentId: participant.agentId,
      role: input.role ?? 'normal',
      createdAt: now,
    });

    return {
      groupId: group.id,
      participantSlug: participant.slug,
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
        eq(internalChatConversationMembers.agentId, participant.agentId),
      ));

    return {
      success: true,
      groupId: input.groupId,
      participantSlug: participant.slug,
    };
  }

  async function listChatGroups(input: {
    agentId: string;
    limit: number;
  }) {
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
        eq(internalChatConversationMembers.agentId, input.agentId),
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
        participantSlug: internalChatAccounts.slug,
        participantName: internalChatAccounts.displayName,
        role: internalChatConversationMembers.role,
        createdAt: internalChatConversationMembers.createdAt,
      })
      .from(internalChatConversationMembers)
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.agentId, internalChatConversationMembers.agentId),
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
      .where(eq(internalChatConversationMembers.agentId, input.agentId))
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
        authorAgentId: internalChatMessages.authorAgentId,
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
        eq(internalChatAccounts.agentId, internalChatMessages.authorAgentId),
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

      if (existing.length < 5) {
        existing.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAgentId,
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
        return {
          targetKey: conversation.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conversation.updatedAt).toISOString(),
          unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
          name: conversation.name ?? undefined,
          participants: participants.map((participant) => participant.agentId),
          messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
        };
      }),
    );

    if (!input.unread) {
      return views;
    }

    return views.filter((view) => view.unreadCount > 0);
  }

  async function getMessages(input: {
    agentId: string;
    conversationKey: string;
    limit: number;
  }): Promise<CommunicationProviderMessage[]> {
    await requireConversationMembership(input.agentId, input.conversationKey);

    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAgentId: internalChatMessages.authorAgentId,
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
        eq(internalChatAccounts.agentId, internalChatMessages.authorAgentId),
      )
      .where(eq(internalChatMessages.conversationId, input.conversationKey))
      .orderBy(desc(internalChatMessages.createdAt))
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
        authorId: row.authorAgentId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await readMessageAttachments(row.messageId),
        unread: row.unread === 1,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  async function sendMessage(input: {
    agentId: string;
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
  }) {
    const directAccount = await getAccountByAgentId(input.targetKey);
    const conversation = directAccount
      ? await ensureDirectConversation(input.agentId, directAccount.agentId)
      : await getRequiredConversationForAgent(input.agentId, input.targetKey);

    if (!conversation) {
      throw new Error(`Conversation not found: ${input.targetKey}`);
    }

    const now = Date.now();
    const messageId = `msg_${createId()}`;
    const members = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, conversation.id),
    });

    await db.insert(internalChatMessages).values({
      id: messageId,
      conversationId: conversation.id,
      authorAgentId: input.agentId,
      content: input.content,
      replyToMessageId: null,
      createdAt: now,
    });
    await storeMessageAttachments(messageId, input.attachments);

    await db.insert(internalChatMessageReads).values(
      members.map((member) => ({
        messageId,
        agentId: member.agentId,
        readAt: member.agentId === input.agentId ? now : null,
      })),
    );

    await db
      .update(internalChatConversations)
      .set({
        updatedAt: now,
      })
      .where(eq(internalChatConversations.id, conversation.id));

    const author = await getRequiredAccount(input.agentId);
    const participants = await listGroupMembersOrDmPeers(input.agentId, conversation.id);

    const deliveries: Array<Promise<void>> = [];

    for (const participant of participants) {
      if (participant.agentId === input.agentId) {
        continue;
      }

      const handler = handlers.get(participant.agentId);

      if (!handler) {
        continue;
      }

      deliveries.push(Promise.resolve(handler({
        targetKey: conversation.id,
        messageId,
        conversationName: conversation.name ?? (conversation.type === 'dm' ? author.displayName : undefined),
        authorId: author.agentId,
        authorDisplayName: author.displayName,
        authorUsername: author.slug,
        content: input.content,
        attachments: input.attachments,
        createdAt: new Date(now).toISOString(),
        metadata: {
          conversationType: conversation.type,
          groupMembers: conversation.type === 'group'
            ? participants.map((member) => ({
                agentId: member.agentId,
                slug: member.slug,
                displayName: member.displayName,
              }))
            : undefined,
        },
      })));
    }

    if (deliveries.length > 0) {
      await Promise.all(deliveries);
    }

    return {
      success: true,
      messageId,
      conversationKey: conversation.id,
    };
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
    const rows = await db
      .select({
        agentId: internalChatConversationMembers.agentId,
        slug: internalChatAccounts.slug,
        displayName: internalChatAccounts.displayName,
      })
      .from(internalChatConversationMembers)
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.agentId, internalChatConversationMembers.agentId),
      )
      .where(eq(internalChatConversationMembers.conversationId, conversationId));

    return rows.sort((left, right) => {
      if (left.agentId === agentId) {
        return -1;
      }

      if (right.agentId === agentId) {
        return 1;
      }

      return left.displayName.localeCompare(right.displayName);
    });
  }

  async function getRequiredAccount(agentId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });

    if (!account) {
      throw new Error(`Internal chat account not found: ${agentId}`);
    }

    return account;
  }

  async function getRequiredAccountBySlug(slug: string) {
    const account = await getAccountBySlug(slug);

    if (!account) {
      throw new Error(`Contact not found: ${slug}`);
    }

    return account;
  }

  async function requireConversationMembership(agentId: string, conversationId: string) {
    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.agentId, agentId),
        eq(internalChatConversationMembers.conversationId, conversationId),
      ),
    });

    if (!membership) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
  }

  async function getRequiredConversationForAgent(agentId: string, conversationId: string) {
    await requireConversationMembership(agentId, conversationId);

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

  return {
    registerAgentAccount,
    onReceiveMessage,
    clearHandler,
    listAccounts,
    getAccountBySlug,
    getAccountByAgentId,
    getConversationForAgent,
    createChatGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    listChatGroups,
    listGroupMembers,
    listConversations,
    getMessages,
    sendMessage,
    getUnreadSummary,
    listRecentConversations,
  };
}

export type InternalChatService = ReturnType<typeof createInternalChatService>;
