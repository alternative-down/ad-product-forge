/**
 * Internal Chat Service — Thin Orchestrator
 *
 * Extracted from internal-chat-service.ts (#1555 split).
 * This module was reduced from ~900 LOC to a thin orchestrator that:
 * - Creates sub-modules (accounts, groups, participants, etc.)
 * - Creates the shared service helpers (guards, lookups)
 * - Re-exports the unified API from sub-modules
 *
 * ## Module Map (after split)
 *
 * | Module | Extracted from | Purpose |
 * |--------|---------------|---------|
 * | internal-chat-accounts.ts | account management | Already separate |
 * | internal-chat-groups.ts | group management | Already separate |
 * | internal-chat-participants.ts | participant listing | Already separate |
 * | internal-chat-unread.ts | unread tracking | Already separate |
 * | internal-chat-listing.ts | account-scoped listing | Already separate |
 * | internal-chat-connection.ts | message delivery | Already separate |
 * | internal-chat-service-helpers.ts | NEW — this split | Guards & lookups |
 * | internal-chat-service.ts | refactored | Thin orchestrator |
 *
 * @module
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

import type { CommunicationFile, CommunicationInboundMessage, CommunicationProvider, CommunicationProviderConversation } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/index';
import {
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessages,
} from '../database/schema';
import { createId } from '../utils/id';
import { createInternalChatConnection, type InternalChatDeliveryMessage } from './internal-chat-connection';
import { createInternalChatGroups } from './internal-chat-groups';
import { createInternalChatAccountOps } from './internal-chat-account-ops';
import { createInternalChatParticipants } from './internal-chat-participants';
import { createInternalChatUnread } from './internal-chat-unread';
import { createInternalChatListing } from './internal-chat-listing';
import {
  ConversationNotFoundError,
  ChatGroupNotFoundError,
} from './internal-chat-errors';
import { createInternalChatAccounts } from './internal-chat-accounts';
import { createChatAttachments } from './internal-chat-attachments';
import { createServiceHelpers, type ServiceHelpers } from './internal-chat-service-helpers';

export type { InternalChatService } from './internal-chat-service';

const alphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

function buildAgentAccountDescription(agentName: string): string {
  return `Internal chat account for agent ${agentName}`;
}

function buildGroupRow(params: { conversationId: string; name: string; creatorName: string; participantNames: string[] }): { id: string; name: string; description: string } {
  return {
    id: params.conversationId,
    name: params.name,
    description: `Group created by ${params.creatorName} with ${params.participantNames.join(', ')}`,
  };
}

function buildGroupMemberViews(members: Array<{ accountId: string; displayName: string; role: string }>, selfAccountId: string) {
  return members
    .filter((m) => m.accountId !== selfAccountId)
    .map((m) => ({
      accountId: m.accountId,
      displayName: m.displayName,
      role: m.role,
    }));
}

export function createInternalChatService(db: Database) {
  // ── Attachments ────────────────────────────────────────────────────────
  const attachments = createChatAttachments(db);

  // ── Accounts ─────────────────────────────────────────────────────────────
  const accounts = createInternalChatAccounts(db);

  // ── Participants ─────────────────────────────────────────────────────────
  const participants = createInternalChatParticipants(db);

  // ── Service Helpers (guards & lookups — extracted to internal-chat-service-helpers.ts) ──
  const helpers = createServiceHelpers({
    db,
    accounts: {
      getRequiredAccount: accounts.getRequiredAccount,
      getRequiredAgentAccount: accounts.getRequiredAgentAccount,
      getAccountBySlug: accounts.getAccountBySlug,
    },
    participants,
  });

  // ── Direct Conversation Creation (inline — used by groups & message ops) ──
  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    const rows = await db
      .select({ conversationId: internalChatConversationMembers.conversationId })
      .from(internalChatConversationMembers)
      .where(inArray(internalChatConversationMembers.accountId, [leftAccountId, rightAccountId]));

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
    }

    const candidates = Array.from(counts.entries())
      .filter(([, count]) => count === 2)
      .map(([id]) => id);

    if (candidates.length > 0) {
      const existing = await db.query.internalChatConversations.findFirst({
        where: and(
          eq(internalChatConversations.type, 'dm'),
          inArray(internalChatConversations.id, candidates),
        ),
      });
      if (existing) return existing;
    }

    const now = Date.now();
    const id = createId();
    await db.insert(internalChatConversations).values({
      id,
      type: 'dm',
      name: null,
      createdByAccountId: leftAccountId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(internalChatConversationMembers).values([
      { conversationId: id, accountId: leftAccountId, role: 'normal', createdAt: now },
      { conversationId: id, accountId: rightAccountId, role: 'normal', createdAt: now },
    ]);
    return db.query.internalChatConversations.findFirst({ where: eq(internalChatConversations.id, id) });
  }

  // ── Groups ────────────────────────────────────────────────────────────────
  const groups = createInternalChatGroups(db, {
    getRequiredAccount: helpers.getRequiredAccount,
    getRequiredAgentAccount: helpers.getRequiredAgentAccount,
    getRequiredAccountBySlug: helpers.getRequiredAccountBySlug,
    getAccountByTargetKey: accounts.getAccountByTargetKey,
    ensureDirectConversation,
  });

  // ── Account-scoped group & conversation operations ───────────────────────
  const accountOps = createInternalChatAccountOps(db, {
    getRequiredAccount: helpers.getRequiredAccount,
    getRequiredExternalAccount: helpers.getRequiredExternalAccount,
    ensureDirectConversation,
    listGroupMembersByAccount: groups.listGroupMembersByAccount,
    getRequiredGroupForAccount: helpers.getRequiredGroupForAccount,
  });

  // ── Unread ───────────────────────────────────────────────────────────────
  const unread = createInternalChatUnread(db);

  // ── Listing ───────────────────────────────────────────────────────────────
  const listing = createInternalChatListing(db, {
    getRequiredAgentAccount: helpers.getRequiredAgentAccount,
    getRequiredExternalAccount: helpers.getRequiredExternalAccount,
    listGroupMembersOrDmPeers: helpers.listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount: helpers.listGroupMembersOrDmPeersByAccount,
    readMessageAttachments: attachments.readMessageAttachments,
  });

  // ── Connection ───────────────────────────────────────────────────────────
  const connection = createInternalChatConnection(db, {
    readMessageAttachments: attachments.readMessageAttachments,
    getRequiredAgentAccount: helpers.getRequiredAgentAccount,
    listGroupMembersOrDmPeers: helpers.listGroupMembersOrDmPeers,
  });

  // ── Agent-scoped account wrappers ────────────────────────────────────────
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

  // ── Group wrappers (delegate to groups module) ───────────────────────────
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
    conversationKey?: string;
  }) {
    return groups.changeChatGroup(input);
  }
  async function listChatGroups(input: {
    agentId: string;
    limit?: number;
    offset?: number;
  }) {
    return groups.listChatGroups(input);
  }
  async function listGroupMembers(input: { agentId: string; groupId: string }) {
    return groups.listGroupMembers(input);
  }
  async function listGroupMembersByAccount(input: { accountId: string; groupId: string }) {
    return groups.listGroupMembersByAccount(input);
  }

  // ── Conversation & Message operations (inline — extracted from large functions) ──
  async function listConversations(input: {
    agentId: string;
    limit: number;
    unread?: boolean;
  }) {
    const agentAccount = await helpers.getRequiredAgentAccount(input.agentId);
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

    const ids = conversationRows.map((r) => r.id);
    if (ids.length === 0) return [];

    const { sql } = await import('drizzle-orm');
    const messageRows = await db
      .select({
        conversationId: internalChatMessages.conversationId,
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: sql`${internalChatAccounts.displayName}`,
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
      .where(inArray(internalChatMessages.conversationId, ids))
      .orderBy(desc(internalChatMessages.createdAt));

    const toMarkRead = new Set<string>();
    const byConversation = new Map<string, CommunicationProviderConversation['messages']>();
    const unreadCount = new Map<string, number>();

    for (const row of messageRows) {
      const cur = unreadCount.get(row.conversationId) ?? 0;
      unreadCount.set(row.conversationId, cur + (row.unread ? 1 : 0));
      const existing = byConversation.get(row.conversationId) ?? [];
      if ((input.unread ? row.unread === 1 : true) && existing.length < 5) {
        existing.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: row.conversationId,
          content: row.content,
          attachments: await attachments.readMessageAttachments(row.messageId),
          unread: row.unread === 1,
          createdAt: new Date(row.createdAt).toISOString(),
          authorDisplayName: row.authorDisplayName,
        });
        if (row.unread === 1) toMarkRead.add(row.messageId);
      }
      byConversation.set(row.conversationId, existing);
    }

    if (toMarkRead.size > 0) {
      const now = Date.now();
      await db.update(internalChatMessageReads)
        .set({ readAt: now })
        .where(and(
          eq(internalChatMessageReads.agentId, input.agentId),
          inArray(internalChatMessageReads.messageId, Array.from(toMarkRead)),
        ));
    }

    const views = await Promise.all(
      conversationRows.map(async (conv) => {
        const pts = await helpers.listGroupMembersOrDmPeers(input.agentId, conv.id);
        const name = conv.name ?? (pts.find((p) => p.accountId !== agentAccount.id)?.displayName ?? pts[0]?.displayName);
        return {
          targetKey: conv.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conv.updatedAt).toISOString(),
          unreadCount: unreadCount.get(conv.id) ?? 0,
          name,
          participants: pts.map((p) => p.displayName),
          messages: [...(byConversation.get(conv.id) ?? [])].reverse(),
        };
      }),
    );

    return input.unread ? views.filter((v) => v.unreadCount > 0) : views;
  }

  async function listConversationsByAccount(input: {
    accountId: string;
    limit: number;
  }) {
    return listing.listConversationsByAccount(input);
  }

  async function getMessages(input: {
    agentId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    await helpers.requireConversationMembership(input.agentId, input.conversationKey);
    const { parseFilterDate } = await import('./internal-chat-helpers');
    const dateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const dateTo = parseFilterDate(input.dateTo, 'dateTo');
    const { like, gte, lte } = await import('drizzle-orm');
    const filters = [
      eq(internalChatMessages.conversationId, input.conversationKey),
      ...(input.query ? [like(internalChatMessages.content, `%${input.query}%`)] : []),
      ...(dateFrom !== null ? [gte(internalChatMessages.createdAt, dateFrom)] : []),
      ...(dateTo !== null ? [lte(internalChatMessages.createdAt, dateTo)] : []),
    ];
    const { sql } = await import('drizzle-orm');
    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: sql`${internalChatAccounts.displayName}`,
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
      .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit).all();

    const unreadIds = rows.filter((r) => r.unread === 1).map((r) => r.messageId);
    if (unreadIds.length > 0) {
      await db.update(internalChatMessageReads).set({ readAt: Date.now() })
        .where(and(eq(internalChatMessageReads.agentId, input.agentId), inArray(internalChatMessageReads.messageId, unreadIds)));
    }

    return Promise.all(rows.reverse().map(async (row) => ({
      messageId: row.messageId,
      provider: 'internal-chat',
      authorId: row.authorAccountId,
      targetKey: input.conversationKey,
      content: row.content,
      attachments: await attachments.readMessageAttachments(row.messageId),
      unread: row.unread === 1,
      createdAt: new Date(row.createdAt).toISOString(),
      authorDisplayName: row.authorDisplayName,
    })));
  }

  async function getMessagesByAccount(input: {
    accountId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    await helpers.requireConversationMembershipByAccount(input.accountId, input.conversationKey);
    const { parseFilterDate } = await import('./internal-chat-helpers');
    const dateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const dateTo = parseFilterDate(input.dateTo, 'dateTo');
    const { like, gte, lte } = await import('drizzle-orm');
    const filters = [
      eq(internalChatMessages.conversationId, input.conversationKey),
      ...(input.query ? [like(internalChatMessages.content, `%${input.query}%`)] : []),
      ...(dateFrom !== null ? [gte(internalChatMessages.createdAt, dateFrom)] : []),
      ...(dateTo !== null ? [lte(internalChatMessages.createdAt, dateTo)] : []),
    ];
    const { sql } = await import('drizzle-orm');
    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: sql`${internalChatAccounts.displayName}`,
      })
      .from(internalChatMessages)
      .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit).all();

    return Promise.all(rows.reverse().map(async (row) => ({
      messageId: row.messageId,
      provider: 'internal-chat',
      authorId: row.authorAccountId,
      targetKey: input.conversationKey,
      content: row.content,
      attachments: await attachments.readMessageAttachments(row.messageId),
      unread: false,
      createdAt: new Date(row.createdAt).toISOString(),
      authorDisplayName: row.authorDisplayName,
    })));
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
    await helpers.getRequiredConversationForAccount(input.accountId, input.conversationId);
    await db.delete(internalChatConversationMembers).where(and(
      eq(internalChatConversationMembers.conversationId, input.conversationId),
      eq(internalChatConversationMembers.accountId, input.accountId),
    ));
    const remaining = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, input.conversationId),
      limit: 1,
    });
    if (remaining.length === 0) {
      await db.delete(internalChatConversations).where(eq(internalChatConversations.id, input.conversationId));
    }
    return { conversationId: input.conversationId, archived: true };
  }

  async function sendMessage(input: {
    accountId: string;
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
  }) {
    const directAccount = await accounts.getAccountByAgentId(input.targetKey) ?? await accounts.getAccountBySlug(input.targetKey);
    const conversation = directAccount
      ? await ensureDirectConversation(input.accountId, directAccount.id)
      : await helpers.getRequiredConversationForAccount(input.accountId, input.targetKey);

    if (!conversation) throw new ConversationNotFoundError(input.targetKey);

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
    await attachments.storeMessageAttachments(messageId, input.attachments);

    const memberAccounts = await Promise.all(members.map((m) => helpers.getRequiredAccount(m.accountId)));
    const readRows = memberAccounts.filter((a) => a.agentId).map((a) => ({
      messageId,
      agentId: a.agentId as string,
      readAt: a.id === input.accountId ? now : null,
    }));
    if (readRows.length > 0) await db.insert(internalChatMessageReads).values(readRows);

    await db.update(internalChatConversations).set({ updatedAt: now })
      .where(eq(internalChatConversations.id, conversation.id));

    const author = await helpers.getRequiredAccount(input.accountId);
    const pts = await helpers.listGroupMembersOrDmPeersByAccount(input.accountId, conversation.id);

    const liveDeliveredAgentIds = connection.deliverToParticipants({
      excludeAccountId: input.accountId,
      participants: pts,
      conversation: { id: conversation.id, name: conversation.name, type: conversation.type },
      messageId,
      author: { id: author.id, displayName: author.displayName, slug: author.slug },
      content: input.content,
      attachments: input.attachments,
      createdAt: new Date(now).toISOString(),
    });

    if (liveDeliveredAgentIds.length > 0) {
      const { isNull } = await import('drizzle-orm');
      await db.update(internalChatMessageReads).set({ readAt: now })
        .where(and(
          eq(internalChatMessageReads.messageId, messageId),
          inArray(internalChatMessageReads.agentId, liveDeliveredAgentIds),
          isNull(internalChatMessageReads.readAt),
        ));
    }

    return { success: true, messageId, conversationKey: conversation.id };
  }

  async function getMessageAttachmentByAccount(input: {
    accountId: string;
    conversationId: string;
    messageId: string;
    attachmentName: string;
  }) {
    await helpers.getRequiredConversationForAccount(input.accountId, input.conversationId);
    const message = await db.query.internalChatMessages.findFirst({
      where: and(
        eq(internalChatMessages.id, input.messageId),
        eq(internalChatMessages.conversationId, input.conversationId),
      ),
    });
    if (!message) throw new ConversationNotFoundError(input.messageId);
    const attachment = await attachments.readMessageAttachment(input.messageId, input.attachmentName);
    if (!attachment) throw new ConversationNotFoundError(input.attachmentName);
    return attachment;
  }

  async function getUnreadSummary(agentId: string) {
    return unread.getUnreadSummary(agentId);
  }

  async function listRecentConversations(agentId: string, limit: number) {
    return listConversations({ agentId, limit });
  }

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
