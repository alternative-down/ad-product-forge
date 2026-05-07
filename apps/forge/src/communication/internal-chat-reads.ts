/**
 * Internal Chat Read Functions
 *
 * Part of #1401 — extract read functions from internal-chat-service.ts.
 *
 * These functions delegate to stores created in internal-chat-service.ts.
 * `createInternalChatReads` creates a mutable object with placeholder functions.
 * Call `reads.init()` with the unread + participants stores (available later in
 * internal-chat-service.ts) to wire up real implementations.
 */

import type {Database} from '../database/client'
import { createInternalChatUnread } from './internal-chat-unread';
import { createInternalChatParticipants } from './internal-chat-participants';

export interface InternalChatReadsStore {
  getUnreadSummary: (agentId: string) => Promise<unknown>;
  listRecentConversations: (agentId: string, limit: number) => Promise<unknown[]>;
  listGroupMembersOrDmPeers: (agentId: string, conversationId: string) => Promise<unknown[]>;
  listGroupMembersOrDmPeersByAccount: (accountId: string, conversationId: string) => Promise<unknown[]>;
  init(deps: {
    unread: ReturnType<typeof createInternalChatUnread>;
    participants: ReturnType<typeof createInternalChatParticipants>;
    listConversations: (input: { agentId: string; unread?: boolean; limit: number }) => Promise<unknown[]>;
  }): void;
}

/**
 * Creates a reads object with placeholder methods. Call `init()` with deps
 * to replace placeholders with real implementations.
 */
export function createInternalChatReads(_db: Database): InternalChatReadsStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unreadStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let participantsStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listConversationsFn: any;

  async function getUnreadSummary(agentId: string) {
    return unreadStore.getUnreadSummary(agentId);
  }

  async function listRecentConversations(agentId: string, limit: number) {
    return listConversationsFn({ agentId, limit });
  }

  async function listGroupMembersOrDmPeers(agentId: string, conversationId: string) {
    return participantsStore.listGroupMembersOrDmPeers(agentId, conversationId);
  }

  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
    return participantsStore.listGroupMembersOrDmPeersByAccount(accountId, conversationId);
  }

  function init(deps: {
    unread: ReturnType<typeof createInternalChatUnread>;
    participants: ReturnType<typeof createInternalChatParticipants>;
    listConversations: (input: { agentId: string; unread?: boolean; limit: number }) => Promise<unknown[]>;
  }) {
    unreadStore = deps.unread;
    participantsStore = deps.participants;
    listConversationsFn = deps.listConversations;
  }

  return {
    getUnreadSummary,
    listRecentConversations,
    listGroupMembersOrDmPeers,
    listGroupMembersOrDmPeersByAccount,
    init,
  };
}