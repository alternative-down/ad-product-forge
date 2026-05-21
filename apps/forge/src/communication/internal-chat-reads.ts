/**
 * Internal Chat Read Functions
 *
 * Part of #1401 — extract read functions from internal-chat-service.ts.
 *
 * Uses proper dependency injection — all deps required at construction time.
 */

import { createInternalChatUnread } from './internal-chat-unread';
import { createInternalChatParticipants } from './internal-chat-participants';

export interface InternalChatReadsDeps {
  unread: ReturnType<typeof createInternalChatUnread>;
  participants: ReturnType<typeof createInternalChatParticipants>;
  listConversations: (input: {
    agentId: string;
    unread?: boolean;
    limit: number;
  }) => Promise<unknown[]>;
}

export interface InternalChatReadsStore {
  getUnreadSummary: (agentId: string) => Promise<unknown>;
  listRecentConversations: (agentId: string, limit: number) => Promise<unknown[]>;
  listGroupMembersOrDmPeersByAccount: (
    accountId: string,
    conversationId: string,
  ) => Promise<unknown[]>;
  listGroupMembersOrDmPeers: (agentId: string, conversationId: string) => Promise<unknown[]>;
}

/**
 * Creates a reads object with all deps injected at construction time.
 * No mutable state — deps are immutable after construction.
 */
export function createInternalChatReads(deps: InternalChatReadsDeps): InternalChatReadsStore {
  async function getUnreadSummary(agentId: string) {
    return await deps.unread.getUnreadSummary(agentId);
  }

  async function listRecentConversations(agentId: string, limit: number) {
    return await deps.listConversations({ agentId, limit });
  }

  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    return await deps.participants.listGroupMembersOrDmPeers(agentId, conversationId);
  }

  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
    return await deps.participants.listGroupMembersOrDmPeersByAccount(accountId, conversationId);
  }

  return {
    getUnreadSummary,
    listRecentConversations,
    listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount,
  };
}
