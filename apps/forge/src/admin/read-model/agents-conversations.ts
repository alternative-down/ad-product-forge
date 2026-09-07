/**
 * Agent conversation read model — extracted from agents.ts (phase 4).
 * Covers: listAgentRecentConversations, listAgentConversationMessages,
 * listAgentThreadMessages.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import { listRecentConversations, listThreadMessages } from './conversation-helpers';
import type { Database } from '../../database/index';
import { toMastraSafeIdentifier } from '@forge-runtime/core';
import type { InternalChatService } from '../../communication/internal-chat-service';
import type { CommunicationMessageView } from '@forge-runtime/core';
import { getInternalAgentRegistry } from '../../agents/internal-agent-registry';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentConversationListItem = Awaited<ReturnType<typeof listRecentConversations>>[number];

// Unexported in E10 — zero internal + zero external usages (audit D69).
interface AgentConversationListInput {
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
  items: Array<{
    messageId: string;
    provider: string;
    authorId: string;
    authorAgentId: string | null;
    targetKey: string;
    content: string;
    attachments: unknown[];
    unread: boolean;
    createdAt: string;
    authorDisplayName: string;
  }>;
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
    limit = 10,
  ): Promise<AgentConversationListItem[]> {
    const conversations = await listRecentConversations(
      workspaceBasePath,
      internalChat,
      agentId,
      agentId,
    );
    return conversations.slice(0, limit);
  }

  async function listAgentConversationMessages(
    params: AgentConversationMessagesInput,
  ): Promise<AgentConversationMessagesResult> {
    const requestedLimit = params.limit + 1;
    const messages =
      params.provider === 'internal-chat'
        ? await internalChat.getMessages({
            agentId: params.agentId,
            conversationKey: params.targetKey,
            limit: requestedLimit,
            offset: params.offset,
          })
        : await getExternalConversationMessages(params, requestedLimit);

    return {
      items: messages.slice(0, params.limit).map((message) => ({
        messageId: message.messageId,
        provider: message.provider,
        authorId: message.authorId ?? '',
        authorAgentId: null,
        targetKey: message.targetKey ?? params.targetKey,
        content: message.content,
        attachments: message.attachments,
        unread: message.unread,
        createdAt: message.createdAt,
        authorDisplayName: message.authorDisplayName ?? 'Unknown author',
      })),
      hasMore: messages.length > params.limit,
    };
  }

  async function getExternalConversationMessages(
    params: AgentConversationMessagesInput,
    limit: number,
  ): Promise<CommunicationMessageView[]> {
    const runtime = getInternalAgentRegistry().get(params.agentId)?.runtime;

    if (!runtime) {
      return [];
    }

    return await runtime.communication.getMessages({
      provider: params.provider,
      targetKey: params.targetKey,
      limit,
      offset: params.offset,
    });
  }

  async function listAgentThreadMessages(
    params: AgentThreadMessagesInput,
  ): Promise<AgentThreadMessagesResult> {
    return await listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  return {
    listAgentRecentConversations,
    listAgentConversationMessages,
    listAgentThreadMessages,
  };
}
