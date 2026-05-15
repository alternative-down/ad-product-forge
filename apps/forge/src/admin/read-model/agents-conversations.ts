/**
 * Agent conversation read model — extracted from agents.ts (phase 4).
 * Covers: listAgentRecentConversations, listAgentConversationMessages,
 * listAgentThreadMessages, listAgentLongTermMemoryThreadMessages.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import { resolve } from 'node:path';
import { createClient } from '@libsql/client';
import {
  closeLibsqlClient,
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
  items: Array<{ content: string; role: string; createdAt: number }>;
  totalPages: number;
  currentPage: number;
}

export interface AgentConversationMessagesInput {
  agentId: string;
  provider: string;
  targetKey: string;
  limit: number;
  offset: number;
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
  const { db, workspaceBasePath, internalChat } = deps;

  async function listAgentRecentConversations(
    agentId: string,
    limit = 10,
  ): Promise<AgentConversationListItem[]> {
    return await listRecentConversations(agentId, limit);
  }

  async function listAgentConversationMessages(
    params: AgentConversationMessagesInput,
  ): Promise<AgentConversationMessagesResult> {
    const messages = await (internalChat as InternalChatService).listMessages({
      provider: params.provider,
      targetKey: params.targetKey,
      limit: params.limit,
      offset: params.offset,
    });
    return {
      items: messages.map((message: CommunicationMessageView) => ({
        ...message,
        authorAgentId: null,
      })),
      hasMore: false,
    };
  }

  async function listAgentThreadMessages(
    params: AgentThreadMessagesInput,
  ): Promise<AgentThreadMessagesResult> {
    return listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  async function listAgentLongTermMemoryThreadMessages(
    params: AgentThreadMessagesInput,
  ): Promise<AgentThreadMessagesResult> {
    return listThreadMessages(workspaceBasePath, params.agentId, {
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
