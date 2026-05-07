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


import type {Database} from "../database/schema";
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
import { createInternalChatListing } from "./internal-chat-listing";
import { createInternalChatParticipants } from "./internal-chat-participants";
import { createInternalChatUnread } from "./internal-chat-unread";
import { createInternalChatGuards } from "./internal-chat-guards";
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
import { createInternalChatReads } from "./internal-chat-reads";
import { createChatSending } from "./internal-chat-sending";
import { createInternalChatConversations } from "./internal-chat-conversations";
import { createServiceHelpers } from "./internal-chat-service-helpers";

export function createInternalChatService(

  db: Database,
) {
  // ── Account Management (delegated to internal-chat-accounts.ts) ─────────
  const accounts = createInternalChatAccounts(db);
  const reads = createInternalChatReads(db);

  // ── Attachments (delegated to internal-chat-attachments.ts) ──────────────
  const attachments = createChatAttachments(db);
  const { storeMessageAttachments, readMessageAttachments, readMessageAttachment } = attachments;

  async function registerAgentAccount(input: Parameters<typeof accounts.registerAgentAccount>[0]) {
    try {
    return accounts.registerAgentAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function registerExternalAccount(input: Parameters<typeof accounts.registerExternalAccount>[0]) {
    try {
    return accounts.registerExternalAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function updateExternalAccount(input: Parameters<typeof accounts.updateExternalAccount>[0]) {
    try {
    return accounts.updateExternalAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function deleteExternalAccount(input: Parameters<typeof accounts.deleteExternalAccount>[0]) {
    try {
    return accounts.deleteExternalAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function deleteAgentAccount(input: Parameters<typeof accounts.deleteAgentAccount>[0]) {
    try {
    return accounts.deleteAgentAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function listAccounts(input: Parameters<typeof accounts.listAccounts>[0]) {
    try {
    return accounts.listAccounts(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function getAccountBySlug(slug: string) {
    try {
    return accounts.getAccountBySlug(slug);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function getAccountByAgentId(agentId: string) {
    try {
    return accounts.getAccountByAgentId(agentId);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function getAccountByTargetKey(targetKey: string) {
    try {
    return accounts.getAccountByTargetKey(targetKey);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }
  async function getConversationForAgent(agentId: string, conversationId: string) {
    try {
    return accounts.getConversationForAgent(agentId, conversationId);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  // ── Conversation Setup ──────────────────────
  // ── Conversation Setup ────────────────────────────────────────────────
  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    try {
    return conversations.ensureDirectConversation(leftAccountId, rightAccountId);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }


  // === Group Management ───────────────────────────────────────────────────
  async function createChatGroup(input: {
    agentId: string;
    conversationKey: string;
    name: string;
    creatorName: string;
  }) {
    try {
    return groups.createChatGroup(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function addMemberToGroup(input: {
    agentId: string;
    groupId: string;
    participantSlug: string;
    role?: string;
  }) {
    try {
    return groups.addMemberToGroup(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function removeMemberFromGroup(input: {
    agentId: string;
    groupId: string;
    participantSlug: string;
  }) {
    try {
    return groups.removeMemberFromGroup(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
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
    try {
    return groups.changeChatGroup(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function listChatGroups(input: {
    agentId: string;
    limit: number;
  }) {
    try {
    return groups.listChatGroups(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function listGroupMembers(input: { agentId: string; groupId: string }): Promise<InternalChatGroupMember[]> {
    try {
    return groups.listGroupMembers(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function listGroupMembersByAccount(input: {
    accountId: string;
    groupId: string;
  }): Promise<InternalChatGroupMember[]> {
    try {
    return groups.listGroupMembersByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }


  // === Message Listing ───────────────────────────────────────────────────
  async function listConversations(input: {
    agentId: string;
    unread?: boolean;
    limit: number;
  }): Promise<CommunicationProviderConversation[]> {
  try {
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
  } catch (err) {
    forgeDebug({ scope: 'internal-chat-service', level: 'error', message: 'listConversations failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
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
  }) {
    try {
    return listing.listConversationsByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
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
  try {
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
  } catch (err) {
    forgeDebug({ scope: 'internal-chat-service', level: 'error', message: 'getMessages failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
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
  try {
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
  } catch (err) {
    forgeDebug({ scope: 'internal-chat-service', level: 'error', message: 'getMessagesByAccount failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  }

  // === Account-scoped Group & Conversation Operations ──────────────────────
  async function archiveConversationByAccount(input: {
    accountId: string;
    conversationId: string;
  }) {
    try {
    return conversations.archiveConversationByAccount({
      accountId: input.accountId,
      conversationId: input.conversationId,
      getRequiredConversationForAccount,
    });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function createExternalChatGroup(input: {
    accountId: string;
    conversationKey: string;
    name: string;
  }) {
    try {
    return accountOps.createExternalChatGroup(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function ensureDirectConversationByAccount(input: {
    accountId: string;
    participantAccountId: string;
  }) {
    try {
    return accountOps.ensureDirectConversationByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
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
    return accountOps.addMemberToGroupByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
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
    return accountOps.updateMemberRoleByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }) {
    try {
    return accountOps.removeMemberFromGroupByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
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
    return accountOps.updateGroupByAccount(input);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function archiveConversationByAccount(input: {
    accountId: string;
    conversationId: string;
  }) {
    try {
    return conversations.archiveConversationByAccount({
      accountId: input.accountId,
      conversationId: input.conversationId,
      getRequiredConversationForAccount,
    });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-service', level: 'error', message: `[internal-chat-service] async function failed`, context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  // === Unread / Recent ────────────────────────────────────────────────────
  const getUnreadSummary = reads.getUnreadSummary;

  const listRecentConversations = reads.listRecentConversations;

  // === Internal Helpers ────────────────────────────────────────────────────
  const listGroupMembersOrDmPeers = reads.listGroupMembersOrDmPeers;

  const listGroupMembersOrDmPeersByAccount = reads.listGroupMembersOrDmPeersByAccount;

  const getRequiredAccount = accounts.getRequiredAccount;
  const getRequiredAgentAccount = accounts.getRequiredAgentAccount;

  const guards = createInternalChatGuards(db, {
    getRequiredAgentAccount,
  });

  // ── Service Helpers (extracted to internal-chat-service-helpers.ts) ──
  const participants = createInternalChatParticipants(db);

  const serviceHelpers = createServiceHelpers({
    db,
    accounts: {
      getRequiredAccount: accounts.getRequiredAccount,
      getRequiredAgentAccount: accounts.getRequiredAgentAccount,
      getAccountBySlug: accounts.getAccountBySlug,
    },
    participants,
  });

  const getRequiredExternalAccount = serviceHelpers.getRequiredExternalAccount;
  const getRequiredAccountBySlug = serviceHelpers.getRequiredAccountBySlug;
  const requireConversationMembership = serviceHelpers.requireConversationMembership;
  const requireConversationMembershipByAccount = serviceHelpers.requireConversationMembershipByAccount;
  const getRequiredConversationForAgent = serviceHelpers.getRequiredConversationForAgent;
  const getRequiredConversationForAccount = serviceHelpers.getRequiredConversationForAccount;
  const getRequiredGroupForAgent = serviceHelpers.getRequiredGroupForAgent;
  const getRequiredGroupForAccount = serviceHelpers.getRequiredGroupForAccount;


  const conversations = createInternalChatConversations(db);

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

  const unread = createInternalChatUnread(db);
  reads.init({ unread, participants, listConversations });

  const listing = createInternalChatListing(db, {
    getRequiredAgentAccount,
    getRequiredExternalAccount,
    listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount,
    readMessageAttachments,
  });


  const connection = createInternalChatConnection(db, {
    readMessageAttachments,
    getRequiredAgentAccount,
    listGroupMembersOrDmPeers,
  });

  // ── Message Sending (delegated to internal-chat-sending.ts) ─────────────
  const { sendMessage, getMessageAttachmentByAccount } = createChatSending({
    db,
    accounts,
    serviceHelpers: {
      getRequiredConversationForAccount,
    },
    groups: {
      ensureDirectConversation,
    },
    connection,
    reads: {
      listGroupMembersOrDmPeersByAccount,
    },
    attachments: {
      storeMessageAttachments,
      readMessageAttachment,
    },
  });

  return {
    registerAgentAccount,
    registerExternalAccount,
    updateExternalAccount,
    deleteExternalAccount,
    deleteAgentAccount,
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