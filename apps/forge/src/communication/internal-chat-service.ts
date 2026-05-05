/**
 * Internal Chat Service
 *
 * A 1300-line factory function organized into five responsibility zones.
 * Each zone handles a distinct concern. The "ByAgent" vs "ByAccount" naming
 * convention reflects an intentional architectural pattern — see below.
 *
 * ## Responsibility Zones
 *
 * | Section | Lines | Purpose |
 * |---------|-------|---------|
 * | Attachments | 54–97 | Store and retrieve message attachments |
 * | Account Management | 98–305 | Register, update, list accounts |
 * | Conversation Setup | 306–388 | Ensure DM conversations exist |
 * | Group Management | 388–575 | Delegate to internal-chat-groups |
 * | Conversations / Messages | 446–1000 | List, read, send messages |
 *
 * ## The ByAgent / ByAccount Pattern
 *
 * Several operations exist in two variants — "ByAgent" and "ByAccount":
 *
 *   ByAgent   — first resolves `agentId` → `accountId`, then does the operation.
 *               Caller only knows the agent identifier.
 *
 *   ByAccount — operates directly on a resolved `accountId`.
 *               Used by admin routes, external integrations, or when
 *               the caller already has a concrete account reference.
 *
 * These are NOT duplicates. They represent different trust domains:
 * - ByAgent routes protect against unauthorized agent impersonation
 * - ByAccount routes are used by trusted callers (admins, external integrations)
 *
 * ## Planned Extraction (#1215)
 *
 * This module will be split into:
 *   - internal-chat-attachments.ts  — attachment storage and retrieval
 *   - internal-chat-accounts.ts    — account registration and lookup
 *   - internal-chat-conversations.ts — conversations, groups, messages
 *   - internal-chat-messages.ts     — send/receive message operations
 *   - internal-chat-service.ts      — thin orchestrator, re-exports unified API
 *
 * @module
 */

import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lte, ne, sql } from "drizzle-orm";
import path from "node:path";
import { customAlphabet } from "nanoid";

import type {
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from "@forge-runtime/core";
import { forgeDebug } from "@forge-runtime/core";

import type { Database } from "../database/index";
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from "../database/schema";
import { createId } from "../utils/id";
import {
  buildAgentAccountDescription,
  buildGroupMemberViews,
  buildGroupRow,
  buildConversationParticipantNames,
  createInternalChatSlug,
  parseFilterDate,
  resolveContentType,
  sanitizeAttachmentName,
  sortParticipantsBySelfFirst,
  type InternalChatGroupMember,
  type InternalChatGroupParticipant,
  type InternalChatGroupRow,
} from "./internal-chat-helpers";
import { createInternalChatConnection, type InternalChatDeliveryMessage } from "./internal-chat-connection";
import { createInternalChatGroups } from "./internal-chat-groups";
import { createInternalChatAccountOps } from "./internal-chat-account-ops";
import { createInternalChatParticipants } from "./internal-chat-participants";
import { createInternalChatUnread } from "./internal-chat-unread";
import {
  ConversationNotFoundError,
  ChatGroupNotFoundError,
  ChatGroupAlreadyExistsError,
  GroupMemberAlreadyExistsError,
  OnlyAdminsCanUpdateGroupError,
  NameRequiredForNewGroupError,
  InternalChatParticipantNotFoundError,
  InternalChatAccountNotFoundError,
  MessageNotFoundError,
  ExternalAccountNotFoundError,
  InternalChatAccountSlugAlreadyExistsError,
  DirectConversationFailedError,
  AttachmentNotFoundError,
} from "./internal-chat-errors";
import { createInternalChatAccounts } from "./internal-chat-accounts";
import { createChatAttachments } from "./internal-chat-attachments";
export function createInternalChatService(

  db: Database,
) {
  // ── Account Management (delegated to internal-chat-accounts.ts) ─────────
  const accounts = createInternalChatAccounts(db);

  // ── Attachments (delegated to internal-chat-attachments.ts) ──────────────
  const attachments = createChatAttachments(db);
  const { storeMessageAttachments, readMessageAttachments, readMessageAttachment } = attachments;

  async function registerAgentAccount(input: Parameters<typeof accounts.registerAgentAccount>[0]) {
    return accounts.registerAgentAccount(input);
  }
  async function registerExternalAccount(input: Parameters<typeof accounts.registerExternalAccount>[0]) {
    return accounts.registerExternalAccount(input);
  }
  async function updateExternalAccount(input: Parameters<typeof accounts.updateExternalAccount>[0]) {
    return accounts.updateExternalAccount(input);
  }
  async function deleteExternalAccount(input: Parameters<typeof accounts.deleteExternalAccount>[0]) {
    return accounts.deleteExternalAccount(input);
  }
  async function listAccounts(input: Parameters<typeof accounts.listAccounts>[0]) {
    return accounts.listAccounts(input);
  }
  async function getAccountBySlug(slug: string) {
    return accounts.getAccountBySlug(slug);
  }
  async function getAccountByAgentId(agentId: string) {
    return accounts.getAccountByAgentId(agentId);
  }
  async function getAccountByTargetKey(targetKey: string) {
    return accounts.getAccountByTargetKey(targetKey);
  }
  async function getConversationForAgent(agentId: string, conversationId: string) {
    return accounts.getConversationForAgent(agentId, conversationId);
  }

  // ── Conversation Setup ──────────────────────
// ── Conversation Setup ──────────────────────────────────────────────────
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


  // === Group Management ───────────────────────────────────────────────────
  async function createChatGroup(input: {
    agentId: string;
    conversationKey: string;
    name: string;
    creatorName: string;
  }) {
    return groups.createChatGroup(input);
  }

  async function addMemberToGroup(input: {
    agentId: string;
    groupId: string;
    participantSlug: string;
    role?: string;
  }) {
    return groups.addMemberToGroup(input);
  }

  async function removeMemberFromGroup(input: {
    agentId: string;
    groupId: string;
    participantSlug: string;
  }) {
    return groups.removeMemberFromGroup(input);
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
    return groups.changeChatGroup(input);
  }

  async function listChatGroups(input: {
    agentId: string;
    limit: number;
  }) {
    return groups.listChatGroups(input);
  }

  async function listGroupMembers(input: { agentId: string; groupId: string }): Promise<InternalChatGroupMember[]> {
    return groups.listGroupMembers(input);
  }

  async function listGroupMembersByAccount(input: {
    accountId: string;
    groupId: string;
  }): Promise<InternalChatGroupMember[]> {
    return groups.listGroupMembersByAccount(input);
  }


  // === Message Listing ───────────────────────────────────────────────────
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
      .limit(input.limit).all();

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
          participants: buildConversationParticipantNames(participants),
          messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
        };
      }),
    );

    if (!input.unread) {
      return views;
    }

    return views.filter((view) => view.unreadCount > 0);
  }

  // ── Account-scoped Conversation Listing ───────────────────────────────────

  // ── ByAccount variant ─────────────────────────────────────────────────────
  // listConversationsByAccount: same as listConversations above, but accepts
  // a resolved accountId directly instead of looking it up from an agentId.
  // Used by admin routes and external integrations that already have the account.
  // NOT a duplicate — this is intentional architectural separation.
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
      .limit(input.limit).all();

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

  // === Message Retrieval ──────────────────────────────────────────────────
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
      .limit(input.limit).all();

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

  // ── Account-scoped Message Retrieval ─────────────────────────────────────

  // ── ByAccount variant ─────────────────────────────────────────────────────
  // getMessagesByAccount: same as getMessages above, but uses accountId directly.
  // Used when the caller already has a concrete account reference.
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
      .limit(input.limit).all();

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

  // === Account-scoped Group & Conversation Operations ──────────────────────
  async function createExternalChatGroup(input: {
    accountId: string;
    conversationKey: string;
    name: string;
  }) {
    return accountOps.createExternalChatGroup(input);
  }

  async function ensureDirectConversationByAccount(input: {
    accountId: string;
    participantAccountId: string;
  }) {
    return accountOps.ensureDirectConversationByAccount(input);
  }

  async function addMemberToGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role?: string;
  }) {
    return accountOps.addMemberToGroupByAccount(input);
  }

  async function updateMemberRoleByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role: string;
  }) {
    return accountOps.updateMemberRoleByAccount(input);
  }

  async function removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }) {
    return accountOps.removeMemberFromGroupByAccount(input);
  }

  async function updateGroupByAccount(input: {
    accountId: string;
    groupId: string;
    name?: string;
    conversationKey?: string;
  }) {
    return accountOps.updateGroupByAccount(input);
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

  // === Message Sending ───────────────────────────────────────────────────
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
      throw new ConversationNotFoundError(input.targetKey);
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

    
    const liveDeliveredAgentIds = connection.deliverToParticipants({
      excludeAccountId: input.accountId,
      participants,
      conversation: {
        id: conversation.id,
        name: conversation.name,
        type: conversation.type,
      },
      messageId,
      author: {
        id: author.id,
        displayName: author.displayName,
        slug: author.slug,
      },
      content: input.content,
      attachments: input.attachments,
      createdAt: new Date(now).toISOString(),
    });

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
      throw new MessageNotFoundError(input.messageId);
    }

    const attachment = await readMessageAttachment(input.messageId, input.attachmentName);

    if (!attachment) {
      throw new AttachmentNotFoundError(input.attachmentName);
    }

    return attachment;
  }

  // === Unread / Recent ────────────────────────────────────────────────────
  async function getUnreadSummary(agentId: string) {
    return unread.getUnreadSummary(agentId);
  }

  async function listRecentConversations(agentId: string, limit: number) {
    return listConversations({
      agentId,
      limit,
    });
  }

  // === Internal Helpers ────────────────────────────────────────────────────
  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    return participants.listGroupMembersOrDmPeers(agentId, conversationId);
  }

  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
    return participants.listGroupMembersOrDmPeersByAccount(accountId, conversationId);
  }

  const getRequiredAccount = accounts.getRequiredAccount;
  const getRequiredAgentAccount = accounts.getRequiredAgentAccount;



  async function getRequiredExternalAccount(accountId: string) {
    const account = await getRequiredAccount(accountId);

    if (account.agentId) {
      throw new ExternalAccountNotFoundError(accountId, "External internal chat account not found");
    }

    return account;
  }

  async function getRequiredAccountBySlug(slug: string) {
    const account = await getAccountBySlug(slug);

    if (!account) {
      throw new InternalChatAccountNotFoundError(slug);
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
      throw new ConversationNotFoundError(conversationId);
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
      throw new ConversationNotFoundError(conversationId);
    }

    return conversation;
  }

  async function getRequiredGroupForAgent(agentId: string, groupId: string) {
    const group = await getRequiredConversationForAgent(agentId, groupId);

    if (group.type !== 'group') {
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }

  async function getRequiredGroupForAccount(accountId: string, groupId: string) {
    const group = await getRequiredConversationForAccount(accountId, groupId);

    if (group.type !== 'group') {
      throw new ChatGroupNotFoundError(groupId);
    }

    return group;
  }


  const groups = createInternalChatGroups(db, {
    getRequiredAccount,
    getRequiredAgentAccount,
    getRequiredAccountBySlug,
    getAccountByTargetKey,
  });

  const accountOps = createInternalChatAccountOps(db, {
    getRequiredAccount,
    getRequiredExternalAccount,
    ensureDirectConversation: groups.ensureDirectConversation,
    listGroupMembersByAccount: groups.listGroupMembersByAccount,
    getRequiredGroupForAccount: groups.getRequiredGroupForAccount,
  });

  const participants = createInternalChatParticipants(db);
  const unread = createInternalChatUnread(db);

  const connection = createInternalChatConnection(db, {
    readMessageAttachments,
    getRequiredAgentAccount,
    listGroupMembersOrDmPeers,
  });

  return {
    registerAgentAccount,
    registerExternalAccount,
    updateExternalAccount,
    deleteExternalAccount,
    onReceiveMessage: connection.onReceiveMessage,
    clearHandler: connection.clearHandler,
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

}

export type InternalChatService = ReturnType<typeof createInternalChatService>;