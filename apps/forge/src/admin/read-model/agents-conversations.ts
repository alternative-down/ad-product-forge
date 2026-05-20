/**
 * Agent conversation read model — extracted from agents.ts (phase 4).
 * Covers: listAgentRecentConversations, listAgentConversationMessages,
 * listAgentThreadMessages, listAgentLongTermMemoryThreadMessages.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import {
  listRecentConversations,
  listThreadMessages,
} from './conversation-helpers';
import type { Database } from '../../database/index';
import { toMastraSafeIdentifier } from '@forge-runtime/core';
import type { InternalChatService } from '../../communication/internal-chat-service';
import type { CommunicationMessageView } from '@forge-runtime/core';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentConversationListItem = Awaited<ReturnType<typeof listRecentConversations>>[number];

export interface AgentConversationListInput {
  agentId: string;
  limit?: number;
}

export interface AgentThreadMessagesInput {
  agentId: string;
  page: number;
  perPage: number;
  threadId?: string;
  tablePrefix?: string;
}

export interface AgentThreadMessagesResult {
   
  items: Array<Record<string, any>>;
  hasMore: boolean;
}

export interface AgentConversationMessagesInput {
  agentId: string;
  provider: string;
  targetKey: string;
  limit: number;
  offset: number;
  agentName?: string;
}

export interface AgentConversationMessagesResult {
  items: Array<CommunicationMessageView & { authorAgentId: string | null }>;
  hasMore: boolean;
}

// ─── Dependencies ──────────────────────────────────────────────────────────

export interface AgentConversationsReadModelDeps {
  db: Database;
  workspaceBasePath: string;
  internalChat: InternalChatService;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createAgentConversationsReadModel(deps: AgentConversationsReadModelDeps) {
  const { workspaceBasePath, internalChat } = deps;

  async function listAgentRecentConversations(
    agentId: string,
    _limit = 10,
  ): Promise<AgentConversationListItem[]> {
    return await listRecentConversations(workspaceBasePath, internalChat, agentId, agentId);
  }

  async function listAgentConversationMessages(
    params: AgentConversationMessagesInput,
  ): Promise<AgentConversationMessagesResult> {
    const messages = await internalChat.getMessages({
      agentId: params.agentId,
      conversationKey: params.targetKey,
      limit: params.limit,
      offset: params.offset,
    }).catch(() => []);
    return {
       
      items: messages.map((message: any) => ({ ...message, authorAgentId: null })),
      hasMore: false,
    };
  }

  async function listAgentThreadMessages(
    params: AgentThreadMessagesInput,
  ): Promise<AgentThreadMessagesResult> {
    return await listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  async function listAgentLongTermMemoryThreadMessages(
    params: AgentThreadMessagesInput,
  ): Promise<AgentThreadMessagesResult> {
    return await listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
      threadId: toMastraSafeIdentifier(`${params.agentId}_long_term_memory`),
      tablePrefix: toMastraSafeIdentifier(params.agentId),
    });
  }

  return {
    listAgentRecentConversations,
    listAgentConversationMessages,
    listAgentThreadMessages,
    listAgentLongTermMemoryThreadMessages,
  };
}
