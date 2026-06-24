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


import type { Database } from '../database/client';
import {
  type InternalChatGroupParticipant as _InternalChatGroupParticipant
} from './internal-chat-helpers';
import {
  createInternalChatConnection,
  type InternalChatConnection
} from './internal-chat-connection';
import { createInternalChatGroups } from './internal-chat-groups';
import { createInternalChatAccountOps } from './internal-chat-account-ops';
import { createInternalChatListing } from './internal-chat-listing';
import { createInternalChatParticipants } from './internal-chat-participants';
import { createInternalChatUnread } from './internal-chat-unread';
import { createInternalChatGuards } from './internal-chat-guards';
import { createInternalChatAccounts } from './internal-chat-accounts';
import { createInternalChatAdmin } from './internal-chat-admin';
import { createChatAttachments } from './internal-chat-attachments';
import { createInternalChatReads } from './internal-chat-reads';
import { createChatSending, type SendingDeps } from './internal-chat-sending';
import { createInternalChatConversations } from './internal-chat-conversations';
import { createServiceHelpers } from './internal-chat-service-helpers';

export function createInternalChatService(db: Database) {
  // ── Account Management (delegated to internal-chat-accounts.ts) ─────────
  const accounts = createInternalChatAccounts(db);
  const admin = createInternalChatAdmin(db);

  // Deferred: reads needs listConversations from listing module (created later).
  // All three deps (unread, participants, listConversations) are required at
  // construction time. We provide throwing stubs for the two that aren't used
  // before actualReads is wired up below, plus a partial participants stub
  // that only implements listGroupMembersOrDmPeersByAccount.
  const reads = createInternalChatReads({
    unread: {
      getUnreadSummary: () => {
        throw new Error('reads not yet initialized');
      },
    },
    participants: {
      listGroupMembersOrDmPeersByAccount: (_a: string, _b: string) => {
        throw new Error('reads not yet initialized');
      },
    } as unknown as ReturnType<typeof createInternalChatParticipants>,
    listConversations: () => {
      throw new Error('reads not yet initialized');
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
    getAccountByTargetKey: async (targetKey: string) => {
      const account = await _getAccountByTargetKey(targetKey);
      if (!account) throw new Error('Account not found by targetKey: ' + targetKey);
      return {
        id: account.id,
        agentId: account.agentId as string | null,
        slug: account.slug,
        displayName: account.displayName,
      };
    },
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
      getAccountBySlug: async (slug: string) => {
        const a = await accounts.getAccountBySlug(slug);
        return a
          ? { id: a.id, agentId: a.agentId, slug: a.slug, displayName: a.displayName }
          : null;
      },
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
    // Wraps groups.listGroupMembersByAccount to match InternalChatAccountOpsDeps signature
    listGroupMembersByAccount: async (input: { accountId: string; groupId: string }) => {
      const members = await groups.listGroupMembersByAccount({
        accountId: input.accountId,
        groupId: input.groupId,
      });
      return members.map((m) => ({
        participantId: m.participantId,
        participantName: m.participantName,
        role: m.role,
        joinedAt: m.createdAt,
      }));
    },
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
  const actualReads = createInternalChatReads({
    unread,
    participants,
    listConversations,
  });
  const getUnreadSummary = actualReads.getUnreadSummary;
  const listRecentConversations = actualReads.listRecentConversations;
  // === Internal Helpers ────────────────────────────────────────────────────

  const _guards = createInternalChatGuards(db, {
    // Narrow agentId|null → string — caller ensures agent accounts have non-null agentId
    getRequiredAgentAccount: async (agentId: string) => {
      const account = await getRequiredAgentAccount(agentId);
      return {
        id: account.id,
        agentId: account.agentId as string,
        slug: account.slug,
        displayName: account.displayName,
      };
    },
  });

  // reads.init() removed — deps now passed at construction

  const connection = createInternalChatConnection(db, {
    readMessageAttachments,
    getRequiredAgentAccount,
    listGroupMembersOrDmPeers: listGroupMembersOrDmPeers as (
      agentId: string,
      conversationId: string,
    ) => Promise<_InternalChatGroupParticipant[]>,
  });

  // ── Message Sending (delegated to internal-chat-sending.ts) ─────────────
  const { sendMessage, getMessageAttachmentByAccount } = createChatSending({
    db,
    accounts: {
      getAccountByAgentId: accounts.getAccountByAgentId as (
        agentId: string,
      ) => Promise<{ id: string; displayName: string; slug: string } | null>,
      getAccountBySlug: accounts.getAccountBySlug as (
        slug: string,
      ) => Promise<{ id: string } | null>,
      getRequiredAccount: accounts.getRequiredAccount as (
        accountId: string,
      ) => Promise<{ id: string; displayName: string; slug: string; agentId: string | null }>,
      getAccountsById: accounts.getAccountsById as (
        accountIds: string[],
      ) => Promise<
        Map<string, { id: string; displayName: string; slug: string; agentId: string | null }>
      >,
    },
    serviceHelpers: {
      getRequiredConversationForAccount: getRequiredConversationForAccount as (
        accountId: string,
        conversationKey: string,
      ) => Promise<{
        id: string;
        type: string;
        name: string | null;
        createdByAccountId: string | null;
        createdAt: number;
        updatedAt: number;
      }>,
    },
    groups: {
      ensureDirectConversation,
    },
    // The InternalChatConnection.deliverToParticipants signature uses
    // InternalChatGroupParticipant (lighter shape, with accountId/agentId
    // fields) while SendingDeps.connection expects InternalChatGroupMember
    // (heavier shape, with groupId/participantKey/participantSlug).
    // At runtime the function only reads the fields it actually needs, so
    // the call is safe. Cast through Parameters<...> to make the structural
    // mismatch explicit rather than disabling TSC.
    connection: {
      deliverToParticipants: ((
        params: Parameters<InternalChatConnection['deliverToParticipants']>[0],
      ) =>
        connection.deliverToParticipants(params)) as SendingDeps['connection']['deliverToParticipants'],
    },
    reads: {
      listGroupMembersOrDmPeersByAccount: listGroupMembersOrDmPeersByAccount as (
        accountId: string,
        conversationId: string,
      ) => Promise<_InternalChatGroupParticipant[]>,
    },
    attachments: {
      storeMessageAttachments,
      readMessageAttachment: async (messageId: string, attachmentName: string) => {
        const file = await readMessageAttachment(messageId, attachmentName);
        if (!file) throw new Error('Attachment not found: ' + attachmentName);
        return { stream: file.data, contentType: file.contentType };
      },
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
