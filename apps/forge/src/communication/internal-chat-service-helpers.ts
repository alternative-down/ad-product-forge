/**
 * Internal Chat Service — Guards & Helpers
 *
 * Extracted from internal-chat-service.ts (#1555 split).
 * Contains permission-checking and lookup helpers shared across
 * conversation, message, and group operations.
 */
import { and, eq } from 'drizzle-orm';

import type { Database } from '../database/client';
import { internalChatConversationMembers, internalChatConversations } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';
import {
  ConversationNotFoundError,
  ChatGroupNotFoundError,
  ExternalAccountNotFoundError,
  InternalChatAccountNotFoundError,
} from './internal-chat-errors';

/** Minimal account shape used by helper functions. */
export interface HelperAccount {
  id: string;
  agentId: string | null;
  slug: string;
  displayName: string;
}

/** Minimal participant shape used by helper functions. */
export interface HelperParticipant {
  accountId: string;
  displayName: string;
}

export interface ServiceHelpersDeps {
  db: Database;
  accounts: {
    getRequiredAccount: (accountId: string) => Promise<HelperAccount>;
    getRequiredAgentAccount: (agentId: string) => Promise<HelperAccount>;
    getAccountBySlug: (slug: string) => Promise<HelperAccount | null>;
  };
  participants: {
    listGroupMembersOrDmPeers: (
      agentId: string,
      conversationId: string,
    ) => Promise<HelperParticipant[]>;
    listGroupMembersOrDmPeersByAccount: (
      accountId: string,
      conversationId: string,
    ) => Promise<HelperParticipant[]>;
  };
}

export interface ServiceHelpers {
  getRequiredAccount: (accountId: string) => Promise<HelperAccount>;
  getRequiredAgentAccount: (agentId: string) => Promise<HelperAccount>;
  getRequiredExternalAccount: (accountId: string) => Promise<HelperAccount>;
  getRequiredAccountBySlug: (slug: string) => Promise<HelperAccount>;
  requireConversationMembership: (agentId: string, conversationId: string) => Promise<void>;
  requireConversationMembershipByAccount: (
    accountId: string,
    conversationId: string,
  ) => Promise<void>;
  getRequiredConversationForAgent: (
    agentId: string,
    conversationId: string,
  ) => Promise<{ id: string; type: string; name: string | null }>;
  getRequiredConversationForAccount: (
    accountId: string,
    conversationId: string,
  ) => Promise<{
    id: string;
    type: string;
    name: string | null;
    createdAt?: number;
    updatedAt?: number;
    createdByAccountId?: string | null;
  }>;
  getRequiredGroupForAgent: (
    agentId: string,
    groupId: string,
  ) => Promise<{ id: string; type: string; name: string | null }>;
  getRequiredGroupForAccount: (
    accountId: string,
    groupId: string,
  ) => Promise<{ id: string; type: string; name: string | null }>;
  listGroupMembersOrDmPeers: (
    agentId: string,
    conversationId: string,
  ) => Promise<HelperParticipant[]>;
  listGroupMembersOrDmPeersByAccount: (
    accountId: string,
    conversationId: string,
  ) => Promise<HelperParticipant[]>;
}

export function createServiceHelpers(deps: ServiceHelpersDeps): ServiceHelpers {
  const { db, accounts, participants } = deps;

  async function getRequiredAccount(accountId: string): Promise<HelperAccount> {
    return await accounts.getRequiredAccount(accountId);
  }

  async function getRequiredAgentAccount(agentId: string): Promise<HelperAccount> {
    return await accounts.getRequiredAgentAccount(agentId);
  }

  async function getRequiredExternalAccount(accountId: string): Promise<HelperAccount> {
    const account = await accounts.getRequiredAccount(accountId);
    if (account.agentId !== null && account.agentId !== undefined) {
      forgeDebug({
        scope: 'internal-chat-service-helpers',
        level: 'warn',
        message: 'getRequiredExternalAccount: not found',
        context: { accountId },
      });
      throw new ExternalAccountNotFoundError(accountId, 'External internal chat account not found');
    }
    return account;
  }

  async function getRequiredAccountBySlug(slug: string): Promise<HelperAccount> {
    const account = await accounts.getAccountBySlug(slug);
    if (!account) {
      forgeDebug({
        scope: 'internal-chat-service-helpers',
        level: 'warn',
        message: 'getRequiredInternalChatAccount: not found',
        context: { slug },
      });
      throw new InternalChatAccountNotFoundError(slug);
    }
    return account;
  }

  async function requireConversationMembership(
    agentId: string,
    conversationId: string,
  ): Promise<void> {
    const account = await getRequiredAgentAccount(agentId);
    return await requireConversationMembershipByAccount(account.id, conversationId);
  }

  async function requireConversationMembershipByAccount(
    accountId: string,
    conversationId: string,
  ): Promise<void> {
    // accountId and conversationId can be any strings - membership check handles validation
    void accountId;
    void conversationId;
    const membership = (await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.accountId, accountId),
        eq(internalChatConversationMembers.conversationId, conversationId),
      ),
    })) as { accountId: string; conversationId: string } | null;
    if (!membership) {
      forgeDebug({
        scope: 'internal-chat-service-helpers',
        level: 'warn',
        message: 'getRequiredConversation: not found',
        context: { conversationId },
      });
      throw new ConversationNotFoundError(conversationId);
    }
  }

  async function getRequiredConversationForAgent(
    agentId: string,
    conversationId: string,
  ): Promise<{ id: string; type: string; name: string | null }> {
    const account = await getRequiredAgentAccount(agentId);
    return await getRequiredConversationForAccount(account.id, conversationId);
  }

  async function getRequiredConversationForAccount(
    accountId: string,
    conversationId: string,
  ): Promise<{
    id: string;
    type: string;
    name: string | null;
    createdAt?: number;
    updatedAt?: number;
    createdByAccountId?: string | null;
  }> {
    await requireConversationMembershipByAccount(accountId, conversationId);
    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
    if (conversation === null || conversation === undefined) {
      forgeDebug({
        scope: 'internal-chat-service-helpers',
        level: 'warn',
        message: 'getRequiredConversation: not found',
        context: { conversationId },
      });
      throw new ConversationNotFoundError(conversationId);
    }
    return conversation;
  }

  async function getRequiredGroupForAgent(
    agentId: string,
    groupId: string,
  ): Promise<{ id: string; type: string; name: string | null }> {
    const group = await getRequiredConversationForAgent(agentId, groupId);
    if (group.type !== 'group') {
      throw new ChatGroupNotFoundError(groupId);
    }
    return group;
  }

  async function getRequiredGroupForAccount(
    accountId: string,
    groupId: string,
  ): Promise<{ id: string; type: string; name: string | null }> {
    const group = await getRequiredConversationForAccount(accountId, groupId);
    if (group.type !== 'group') {
      throw new ChatGroupNotFoundError(groupId);
    }
    return group;
  }

  async function listGroupMembersOrDmPeers(
    agentId: string,
    conversationId: string,
  ): Promise<HelperParticipant[]> {
    return await participants.listGroupMembersOrDmPeers(agentId, conversationId);
  }

  async function listGroupMembersOrDmPeersByAccount(
    accountId: string,
    conversationId: string,
  ): Promise<HelperParticipant[]> {
    return await participants.listGroupMembersOrDmPeersByAccount(accountId, conversationId);
  }

  return {
    getRequiredAccount,
    getRequiredAgentAccount,
    getRequiredExternalAccount,
    getRequiredAccountBySlug,
    requireConversationMembership,
    requireConversationMembershipByAccount,
    getRequiredConversationForAgent,
    getRequiredConversationForAccount,
    getRequiredGroupForAgent,
    getRequiredGroupForAccount,
    listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount,
  };
}
