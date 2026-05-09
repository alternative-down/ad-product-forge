/**
 * Internal Chat Service — Thin Orchestrator
 *
 * Delegates to specialized modules extracted from the original 1300-line
 * factory function. This file owns the public API surface and wiring.
 *
 * ## Extracted Modules
 *
 * | Module | Purpose |
 * |--------|---------|
 * | internal-chat-accounts.ts | Account registration and lookup |
 * | internal-chat-attachments.ts | Attachment storage and retrieval |
 * | internal-chat-conversations.ts | Conversation creation and management |
 * | internal-chat-groups.ts | Group chat management |
 * | internal-chat-listing.ts | Conversation listing (#1997) |
 * | internal-chat-messages.ts | Message retrieval and archival (#1997) |
 * | internal-chat-sending.ts | Message sending |
 * | internal-chat-reads.ts | Read receipts and unread tracking |
 * | internal-chat-guards.ts | Membership and authorization guards |
 * | internal-chat-connection.ts | WebSocket-style real-time delivery |
 *
 * ## Remaining Inline Logic
 *
 * - listConversations / listConversationsByAccount — delegated to listing module
 * - getMessages / getMessagesByAccount — delegated to messages module
 * - All other ByAccount group operations — delegated to groups/conversations
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
 * These are NOT duplicates. They represent different trust domains.
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
  const getRequiredAccount = accounts.getRequiredAccount;
  const getRequiredAgentAccount = accounts.getRequiredAgentAccount;
  const getAccountByTargetKey = accounts.getAccountByTargetKey;
  const getRequiredAccountBySlug = accounts.getRequiredAccountBySlug;



  const conversations = createInternalChatConversations(db);

  const groups = createInternalChatGroups(db, {
    getRequiredAccount,
    getRequiredAgentAccount,
    getRequiredAccountBySlug,
    getAccountByTargetKey,
  });

  /**
   * Inline error wrapper — replaces the repetitive try/catch + forgeDebug pattern
   * across all simple delegation methods in this service.
   */
  // Transparent passthrough — no-op wrapper retained for API compatibility.
  // The try/catch was removed: underlying functions handle errors and callers
  // have their own error handling. The generic `[internal-chat-service] async
  // function failed` message added no value over the real error.
  function wrap<T extends (...args: unknown[]) => Promise<unknown>>(fn: T): T {
    return fn as T;
  }


  const registerAgentAccount = accounts.registerAgentAccount.bind(accounts);
  const registerExternalAccount = accounts.registerExternalAccount.bind(accounts);
  const updateExternalAccount = accounts.updateExternalAccount.bind(accounts);
  const deleteExternalAccount = accounts.deleteExternalAccount.bind(accounts);
  const deleteAgentAccount = accounts.deleteAgentAccount.bind(accounts);
  const listAccounts = accounts.listAccounts.bind(accounts);
  const getAccountBySlug = accounts.getAccountBySlug.bind(accounts);
  const getAccountByAgentId = accounts.getAccountByAgentId.bind(accounts);
  const getConversationForAgent = accounts.getConversationForAgent.bind(accounts);

  // ── Conversation Setup ──────────────────────
  // ── Conversation Setup ────────────────────────────────────────────────
  const ensureDirectConversation = conversations.ensureDirectConversation;


  // === Group Management ───────────────────────────────────────────────────
  const createChatGroup = groups.createChatGroup;

  const addMemberToGroup = groups.addMemberToGroup;

  const removeMemberFromGroup = groups.removeMemberFromGroup;

  const changeChatGroup = groups.changeChatGroup;

  const listChatGroups = groups.listChatGroups;

  const listGroupMembers = groups.listGroupMembers;

  const listGroupMembersByAccount = groups.listGroupMembersByAccount;


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
    throw err;
  }
  }

  // ── Account-scoped Conversation Listing ───────────────────────────────────

  // ── ByAccount variant ─────────────────────────────────────────────────────
  // listConversationsByAccount: same as listConversations above, but accepts
  // a resolved accountId directly instead of looking it up from an agentId.
  // Used by admin routes and external integrations that already have the account.
  // NOT a duplicate — this is intentional architectural separation.
  const listConversationsByAccount = listing.listConversationsByAccount;

  // === Message Retrieval ──────────────────────────────────────────────────
  const getMessages = listing.getMessages

  // ── Account-scoped Message Retrieval ─────────────────────────────────────

  // ── ByAccount variant ─────────────────────────────────────────────────────
  const getMessagesByAccount = listing.getMessagesByAccount

  // === Account-scoped Group & Conversation Operations ──────────────────────
  const archiveConversationByAccount = conversations.archiveConversationByAccount;

  const createExternalChatGroup = groups.createExternalChatGroup;

  const ensureDirectConversationByAccount = conversations.ensureDirectConversationByAccount;

  const addMemberToGroupByAccount = groups.addMemberToGroupByAccount;

  const updateMemberRoleByAccount = groups.updateMemberRoleByAccount;

  const removeMemberFromGroupByAccount = groups.removeMemberFromGroupByAccount;

  const updateGroupByAccount = groups.updateGroupByAccount;


  // === Unread / Recent ────────────────────────────────────────────────────
  const getUnreadSummary = reads.getUnreadSummary;

  const listRecentConversations = reads.listRecentConversations;

  // === Internal Helpers ────────────────────────────────────────────────────
  const listGroupMembersOrDmPeers = reads.listGroupMembersOrDmPeers;

  const listGroupMembersOrDmPeersByAccount = reads.listGroupMembersOrDmPeersByAccount;



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
  const requireConversationMembership = serviceHelpers.requireConversationMembership;

  const listing = createInternalChatListing(db, {
    getRequiredAgentAccount,
    getRequiredExternalAccount,
    listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount,
    readMessageAttachments,
  });

  const requireConversationMembershipByAccount = serviceHelpers.requireConversationMembershipByAccount;
  const getRequiredConversationForAgent = serviceHelpers.getRequiredConversationForAgent;
  const getRequiredConversationForAccount = serviceHelpers.getRequiredConversationForAccount;
  const getRequiredGroupForAgent = serviceHelpers.getRequiredGroupForAgent;
  const getRequiredGroupForAccount = serviceHelpers.getRequiredGroupForAccount;

  const accountOps = createInternalChatAccountOps(db, {
    getRequiredAccount,
    getRequiredExternalAccount,
    ensureDirectConversation: groups.ensureDirectConversation,
    listGroupMembersByAccount: groups.listGroupMembersByAccount,
    getRequiredGroupForAccount: groups.getRequiredGroupForAccount,
  });

  const unread = createInternalChatUnread(db);
  reads.init({ unread, participants, listConversations });


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