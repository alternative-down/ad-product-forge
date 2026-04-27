import {
  and,
  desc,
  eq,
  gte,
  lte,
  sql,
} from 'drizzle-orm';
import {
  listThreadMessages,
  listRecentConversations,
} from '../conversation-helpers';
import {
  toMastraSafeIdentifier,
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';
import type { Database } from '../../database/index';
import {
  agentExecutionContracts,
  agentExecutionSteps,
  agentHomeMetricSnapshots,
  agents,
  agentNotifications,
  agentProviders,
  llmProfiles,
} from '../../../database/schema';
import { getInternalAgentRegistry } from '../../../agents/internal-agent-registry';

export interface AgentReadModelFunctions {
  listAgentExecutionSteps: (input: {
    agentId: string;
    limit: number;
    offset: number;
  }) => Promise<unknown>;
  listAgentThreadMessages: (params: {
    agentId: string;
    page: number;
    perPage: number;
  }) => Promise<unknown>;
  listAgentLongTermMemoryThreadMessages: (params: {
    agentId: string;
    page: number;
    perPage: number;
  }) => Promise<unknown>;
  listAgentConversationMessages: (params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) => Promise<unknown>;
  listAgentRecentConversations: (agentId: string) => Promise<unknown>;
  listRecentAgentHomeMetricSnapshots: (input: {
    agentId: string;
    limit: number;
  }) => Promise<unknown>;
  debugAgentLongTermMemoryRecallSearch: (
    agentId: string,
    input: unknown,
  ) => Promise<unknown>;
}

export function createAgentReadModel(input: {
  db: Database;
  workspaceBasePath: string;
  internalChat: {
    getMessages: (params: {
      agentId: string;
      conversationKey: string;
      limit: number;
      offset: number;
    }) => Promise<CommunicationProviderMessage[]>;
    listAccounts: () => Promise<Array<{ id: string; agentId: string | null }>>;
  };
}): AgentReadModelFunctions {
  const { db } = input;

  async function listAgentExecutionSteps(input: {
    agentId: string;
    limit: number;
    offset: number;
  }) {
    const now = Date.now();
    const activeContract = await db.query.agentExecutionContracts.findFirst({
      where: and(
        eq(agentExecutionContracts.agentId, input.agentId),
        lte(agentExecutionContracts.startsAt, now),
        gte(agentExecutionContracts.endsAt, now),
      ),
      orderBy: [desc(agentExecutionContracts.endsAt)],
    });

    if (!activeContract) {
      return {
        items: [],
        hasMore: false,
      };
    }

    const rows = await db.query.agentExecutionSteps.findMany({
      where: eq(agentExecutionSteps.contractId, activeContract.id),
      orderBy: [desc(agentExecutionSteps.createdAt)],
      limit: input.limit,
      offset: input.offset,
    });

    return {
      items: rows.map((step) => {
        const { id, ...rest } = step;

        return {
          ...rest,
          stepId: id,
        };
      }),
      hasMore: rows.length === input.limit,
    };
  }

  async function listAgentThreadMessages(params: {
    agentId: string;
    page: number;
    perPage: number;
  }) {
    return listThreadMessages(input.workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  async function listAgentLongTermMemoryThreadMessages(params: {
    agentId: string;
    page: number;
    perPage: number;
  }) {
    return listThreadMessages(input.workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
      threadId: toMastraSafeIdentifier(`${params.agentId}_long_term_memory`),
      tablePrefix: toMastraSafeIdentifier(params.agentId),
    });
  }

  async function listAgentConversationMessages(params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) {
    if (params.provider === 'internal-chat') {
      const messages = await input.internalChat.getMessages({
        agentId: params.agentId,
        conversationKey: params.targetKey,
        limit: params.limit,
        offset: params.offset,
      });
      const accounts = await input.internalChat.listAccounts();
      const agentIdByAccountId = new Map(
        accounts.map((account) => [account.id, account.agentId ?? null]),
      );

      return {
        items: messages.map((message: CommunicationProviderMessage) => ({
          ...message,
          authorAgentId: message.authorId
            ? (agentIdByAccountId.get(message.authorId) ?? null)
            : null,
        })),
        hasMore: messages.length === params.limit,
      };
    }

    const runtime = getInternalAgentRegistry().get(params.agentId)?.runtime;

    if (!runtime) {
      return {
        items: [],
        hasMore: false,
      };
    }

    const messages = await runtime.communication.getMessages({
      provider: params.provider,
      targetKey: params.targetKey,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      items: messages.map((message) => ({
        ...message,
        authorAgentId: null,
      })),
      hasMore: messages.length === params.limit,
    };
  }

  async function listAgentRecentConversations(agentId: string) {
    return listRecentConversations(
      input.workspaceBasePath,
      agentId,
      { perPage: 10 },
      (messages) => messages,
    );
  }

  async function listRecentAgentHomeMetricSnapshots(input: {
    agentId: string;
    limit: number;
  }) {
    const rows = await db.query.agentHomeMetricSnapshots.findMany({
      where: eq(agentHomeMetricSnapshots.agentId, input.agentId),
      orderBy: [desc(agentHomeMetricSnapshots.createdAt)],
      limit: input.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      stepId: row.stepId,
      stepCreatedAt: row.stepCreatedAt,
      createdAt: row.createdAt,
      snapshot: row.snapshot,
    }));
  }

  async function debugAgentLongTermMemoryRecallSearch(
    agentId: string,
    input: unknown,
  ) {
    const loadedAgent = getInternalAgentRegistry().get(agentId);

    if (!loadedAgent) {
      throw new Error(`Agent is not loaded: ${agentId}`);
    }

    if (!loadedAgent.runtime.longTermMemoryRecall) {
      throw new Error(
        `Long-term memory recall is not available for agent: ${agentId}`,
      );
    }

    const result =
      await loadedAgent.runtime.longTermMemoryRecall.debugSearch(
        input as Parameters<
          typeof loadedAgent.runtime.longTermMemoryRecall.debugSearch
        >[0],
      );

    return {
      ...result,
      lastInitAt: result.lastInitAt
        ? new Date(result.lastInitAt).getTime()
        : null,
    };
  }

  return {
    listAgentExecutionSteps,
    listAgentThreadMessages,
    listAgentLongTermMemoryThreadMessages,
    listAgentConversationMessages,
    listAgentRecentConversations,
    listRecentAgentHomeMetricSnapshots,
    debugAgentLongTermMemoryRecallSearch,
  };
}