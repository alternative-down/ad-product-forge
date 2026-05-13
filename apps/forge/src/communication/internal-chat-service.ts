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
import { createInternalChatAdmin } from "./internal-chat-admin";
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
  const admin = createInternalChatAdmin(db);

  // Deferred: reads needs listConversations from listing module (created later).
  // Only listGroupMembersOrDmPeersByAccount is used before actualReads exists,
  // so we only stub that one method here.
  const reads = createInternalChatReads(db, {
    participants: { listGroupMembersOrDmPeersByAccount: async () => { throw new Error("reads not yet initialized"); } },
  });

  // ── Attachments (delegated to internal-chat-attachments.ts) ──────────────
  const attachments = createChatAttachments(db);
  const { storeMessageAttachments, readMessageAttachments, readMessageAttachment } = attachments;
  const getRequiredAccount = accounts.getRequiredAccount;
  const getAccountsById = accounts.getAccountsById;
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

const registerAgentAccount = admin.registerAgentAccount;
  const registerExternalAccount = admin.registerExternalAccount;
  const updateExternalAccount = admin.updateExternalAccount;
  const deleteExternalAccount = admin.deleteExternalAccount;
  const deleteAgentAccount = admin.deleteAgentAccount;
  const listAccounts = admin.listAccounts;
  const getAccountBySlug = admin.getAccountBySlug;
  const getAccountByAgentId = admin.getAccountByAgentId;
  const getConversationForAgent = admin.getConversationForAgent;

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

  const listGroupMembersOrDmPeers = reads.listGroupMembersOrDmPeers;
  const listGroupMembersOrDmPeersByAccount = reads.listGroupMembersOrDmPeersByAccount;

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
  const requireConversationMembershipByAccount = serviceHelpers.requireConversationMembershipByAccount;
  const getRequiredConversationForAgent = serviceHelpers.getRequiredConversationForAgent;
  const getRequiredConversationForAccount = serviceHelpers.getRequiredConversationForAccount;
  const getRequiredGroupForAgent = serviceHelpers.getRequiredGroupForAgent;
  const getRequiredGroupForAccount = serviceHelpers.getRequiredGroupForAccount;

  const listing = createInternalChatListing(db, {
    getRequiredAgentAccount,
    getRequiredExternalAccount,
    listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount,
    readMessageAttachments,
  });
  const listConversations = listing.listConversations;

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

  const accountOps = createInternalChatAccountOps(db, {
    getRequiredAccount,
    getRequiredExternalAccount,
    ensureDirectConversation: groups.ensureDirectConversation,
    listGroupMembersByAccount: groups.listGroupMembersByAccount,
    getRequiredGroupForAccount: groups.getRequiredGroupForAccount,
  });

  const createExternalChatGroup = accountOps.createExternalChatGroup;
  const createExternalChatGroupWithMembers = accountOps.createExternalChatGroupWithMembers;

  const ensureDirectConversationByAccount = accountOps.ensureDirectConversationByAccount;

  const { addMemberToGroupByAccount, updateMemberRoleByAccount, removeMemberFromGroupByAccount, updateGroupByAccount } = accountOps;

  // === Unread / Recent ────────────────────────────────────────────────────

  // ── DI: Initialize reads with actual deps ───────────────────────────────
  const unread = createInternalChatUnread(db);
  const actualReads = createInternalChatReads(db, {
    unread,
    participants,
    listConversations,
  });
  const getUnreadSummary = actualReads.getUnreadSummary;
  const listRecentConversations = actualReads.listRecentConversations;
  // === Internal Helpers ────────────────────────────────────────────────────

  const guards = createInternalChatGuards(db, {
    getRequiredAgentAccount,
  });

  // reads.init() removed — deps now passed at construction

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
    createExternalChatGroupWithMembers,
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