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

import {
  and as _and,
  desc as _desc,
  eq as _eq,
  gte as _gte,
  inArray as _inArray,
  isNotNull as _isNotNull,
  isNull as _isNull,
  like as _like,
  lte as _lte,
  ne as _ne,
  sql as _sql,
} from 'drizzle-orm';
import * as _path from 'node:path';
import { customAlphabet as _customAlphabet } from 'nanoid';

import type {
  CommunicationFile as _CommunicationFile,
  CommunicationInboundMessage as _CommunicationInboundMessage,
  CommunicationProviderConversation as _CommunicationProviderConversation,
  CommunicationProviderMessage as _CommunicationProviderMessage,
} from '@forge-runtime/core';
import { forgeDebug as _forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import {
  internalChatAccounts as _internalChatAccounts,
  internalChatConversationMembers as _internalChatConversationMembers,
  internalChatConversations as _internalChatConversations,
  internalChatMessageAttachments as _internalChatMessageAttachments,
  internalChatMessageReads as _internalChatMessageReads,
  internalChatMessages as _internalChatMessages,
} from '../database/schema';
import { createId as _createId } from '../utils/id';
import {
  buildAgentAccountDescription as _buildAgentAccountDescription,
  buildGroupMemberViews as _buildGroupMemberViews,
  buildGroupRow as _buildGroupRow,
  buildConversationParticipantNames as _buildConversationParticipantNames,
  createInternalChatSlug as _createInternalChatSlug,
  parseFilterDate as _parseFilterDate,
  resolveContentType as _resolveContentType,
  sanitizeAttachmentName as _sanitizeAttachmentName,
  sortParticipantsBySelfFirst as _sortParticipantsBySelfFirst,
  type InternalChatGroupMember as _InternalChatGroupMember,
  type InternalChatGroupParticipant as _InternalChatGroupParticipant,
  type InternalChatGroupRow as _InternalChatGroupRow,
} from './internal-chat-helpers';
import {
  createInternalChatConnection,
  type InternalChatDeliveryMessage as _InternalChatDeliveryMessage,
} from './internal-chat-connection';
import { createInternalChatGroups } from './internal-chat-groups';
import { createInternalChatAccountOps } from './internal-chat-account-ops';
import { createInternalChatListing } from './internal-chat-listing';
import { createInternalChatParticipants } from './internal-chat-participants';
import { createInternalChatUnread } from './internal-chat-unread';
import { createInternalChatGuards } from './internal-chat-guards';
import {
  ConversationNotFoundError as _ConversationNotFoundError,
  ChatGroupNotFoundError as _ChatGroupNotFoundError,
  ChatGroupAlreadyExistsError as _ChatGroupAlreadyExistsError,
  OnlyAdminsCanUpdateGroupError as _OnlyAdminsCanUpdateGroupError,
  NameRequiredForNewGroupError as _NameRequiredForNewGroupError,
  InternalChatAccountNotFoundError as _InternalChatAccountNotFoundError,
  MessageNotFoundError as _MessageNotFoundError,
  ExternalAccountNotFoundError as _ExternalAccountNotFoundError,
  InternalChatAccountSlugAlreadyExistsError as _InternalChatAccountSlugAlreadyExistsError,
  DirectConversationFailedError as _DirectConversationFailedError,
  AttachmentNotFoundError as _AttachmentNotFoundError,
} from './internal-chat-errors';
import { createInternalChatAccounts } from './internal-chat-accounts';
import { createInternalChatAdmin } from './internal-chat-admin';
import { createChatAttachments } from './internal-chat-attachments';
import { createInternalChatReads } from './internal-chat-reads';
import { createChatSending } from './internal-chat-sending';
import { createInternalChatConversations } from './internal-chat-conversations';
import { createServiceHelpers } from './internal-chat-service-helpers';

export function createInternalChatService(db: Database) {
  // ── Account Management (delegated to internal-chat-accounts.ts) ─────────
  const accounts = createInternalChatAccounts(db);
  const admin = createInternalChatAdmin(db);

  // Deferred: reads needs listConversations from listing module (created later).
  // Only listGroupMembersOrDmPeersByAccount is used before actualReads exists,
  // so we only stub that one method here.
  // @ts-expect-error -- createInternalChatReads overload mismatch on participants parameter
  const reads = createInternalChatReads(db, {
    participants: {
      listGroupMembersOrDmPeersByAccount: (_a: string, _b: string) => {
        throw new Error('reads not yet initialized');
      },
    },
  });

  // ── Attachments (delegated to internal-chat-attachments.ts) ──────────────
  const attachments = createChatAttachments(db);
  const { storeMessageAttachments, readMessageAttachments, readMessageAttachment } = attachments;
  const getRequiredAccount = accounts.getRequiredAccount;
  const _getAccountsById = accounts.getAccountsById;
  const getRequiredAgentAccount = accounts.getRequiredAgentAccount;
  const _getAccountByTargetKey = accounts.getAccountByTargetKey;
  const getRequiredAccountBySlug = accounts.getRequiredAccountBySlug;

  const conversations = createInternalChatConversations(db);

  const groups = createInternalChatGroups(db, {
    getRequiredAccount,
    getRequiredAgentAccount,
    getRequiredAccountBySlug,
    getAccountByTargetKey: _getAccountByTargetKey as any,
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
      getRequiredAccount: accounts.getRequiredAccount as any,
      getRequiredAgentAccount: accounts.getRequiredAgentAccount as any,
      getAccountBySlug: accounts.getAccountBySlug as any,
    },
    participants,
  });

  const getRequiredExternalAccount = serviceHelpers.getRequiredExternalAccount;
  const _requireConversationMembership = serviceHelpers.requireConversationMembership;
  const _requireConversationMembershipByAccount =
    serviceHelpers.requireConversationMembershipByAccount;
  const _getRequiredConversationForAgent = serviceHelpers.getRequiredConversationForAgent;
  const getRequiredConversationForAccount = serviceHelpers.getRequiredConversationForAccount;
  const _getRequiredGroupForAgent = serviceHelpers.getRequiredGroupForAgent;
  const _getRequiredGroupForAccount = serviceHelpers.getRequiredGroupForAccount;

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
  const getMessages = listing.getMessages;

  // ── Account-scoped Message Retrieval ─────────────────────────────────────

  // ── ByAccount variant ─────────────────────────────────────────────────────
  const getMessagesByAccount = listing.getMessagesByAccount;

  // === Account-scoped Group & Conversation Operations ──────────────────────
  const archiveConversationByAccount = conversations.archiveConversationByAccount;

  const accountOps = createInternalChatAccountOps(db, {
    getRequiredAccount,
    getRequiredExternalAccount,
    ensureDirectConversation: conversations.ensureDirectConversation,
    listGroupMembersByAccount: groups.listGroupMembersByAccount as any,
    getRequiredGroupForAccount: groups.getRequiredGroupForAccount,
  });

  const createExternalChatGroup = accountOps.createExternalChatGroup;
  const createExternalChatGroupWithMembers = accountOps.createExternalChatGroupWithMembers;

  const ensureDirectConversationByAccount = accountOps.ensureDirectConversationByAccount;

  const {
    addMemberToGroupByAccount,
    updateMemberRoleByAccount,
    removeMemberFromGroupByAccount,
    updateGroupByAccount,
  } = accountOps;

  // === Unread / Recent ────────────────────────────────────────────────────

  // ── DI: Initialize reads with actual deps ───────────────────────────────
  const unread = createInternalChatUnread(db);
  // @ts-expect-error -- createInternalChatReads overload mismatch on participants/listConversations
  const actualReads = createInternalChatReads(db, {
    unread,
    participants,
    listConversations,
  });
  const getUnreadSummary = actualReads.getUnreadSummary;
  const listRecentConversations = actualReads.listRecentConversations;
  // === Internal Helpers ────────────────────────────────────────────────────

  const _guards = createInternalChatGuards(db, {
    getRequiredAgentAccount: getRequiredAgentAccount as any,
  });

  // reads.init() removed — deps now passed at construction

  const connection = createInternalChatConnection(db, {
    readMessageAttachments,
    getRequiredAgentAccount,
    listGroupMembersOrDmPeers: listGroupMembersOrDmPeers as any,
  }) as any;

  // ── Message Sending (delegated to internal-chat-sending.ts) ─────────────
  const { sendMessage, getMessageAttachmentByAccount } = createChatSending({
    db,
    accounts: accounts as any,
    serviceHelpers: {
      getRequiredConversationForAccount: getRequiredConversationForAccount as any,
    },
    groups: {
      ensureDirectConversation,
    },
    connection,
    reads: {
      listGroupMembersOrDmPeersByAccount: listGroupMembersOrDmPeersByAccount as any,
    },
    attachments: {
      storeMessageAttachments,
      readMessageAttachment: readMessageAttachment as any,
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
