/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
  clearAgentHistorySchema,
  agentLongTermMemoryRecallSearchSchema,
  agentActionSchema,
} from '../schemas/agents';
import { jsonResponse, parseJsonBody } from '../index';
import { forgeDebug } from '@forge-runtime/core';

// Local schemas for routes that aren't exported
interface ReadModel {
  listAgents: () => Promise<unknown>;
  getAgent: (id: string) => Promise<unknown>;
  listAgentRecentConversations: (id: string) => Promise<unknown>;
  listAgentExecutionSteps: (query: { agentId: string; limit: number; offset: number }) => Promise<unknown>;
  listAgentThreadMessages: (params: { agentId: string; page: number; perPage: number }) => Promise<unknown>;
  listAgentLongTermMemoryThreadMessages: (params: { agentId: string; page: number; perPage: number }) => Promise<unknown>;
  getAgentRuntimeMemory: (id: string) => Promise<unknown>;
  getAgentOmDebugExport: (id: string) => Promise<unknown>;
  debugAgentLongTermMemoryRecallSearch: (agentId: string, opts: { query: string }) => Promise<unknown>;
  listAgentConversationMessages: (params: { agentId: string; provider: string; targetKey: string; limit: number; offset: number }) => Promise<unknown>;
}

interface AgentRoutesDeps {
  db: unknown;
  workspaceBasePath: string;
  loaderConfig: unknown;
}

/**
 * Register GET routes for agents list/read operations
 */
export function registerAgentReadRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  readModel: ReadModel
) {
  // GET /admin/agents
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => {
      try {
        return jsonResponse(await readModel.listAgents());
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agents failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      try {
        const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
        const agent = await readModel.getAgent(agentId);
        if (!agent) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
        return jsonResponse(agent);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/recent-conversations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/recent-conversations',
    handler: async (request) => {
      try {
        const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
        const conversations = await readModel.listAgentRecentConversations(agentId);
        if (!conversations) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
        return jsonResponse(conversations);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/recent-conversations failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/execution-steps
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/execution-steps',
    handler: async (request) => {
      try {
        const query = agentExecutionStepsQuerySchema.parse({
          agentId: request.query.get('agentId'),
          limit: request.query.get('limit') ?? undefined,
          offset: request.query.get('offset') ?? undefined,
        });
        return jsonResponse(await readModel.listAgentExecutionSteps(query));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/execution-steps failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/thread-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/thread-messages',
    handler: async (request) => {
      try {
        const query = agentThreadMessagesQuerySchema.parse({
          agentId: request.query.get('agentId'),
          page: request.query.get('page') ?? undefined,
          perPage: request.query.get('perPage') ?? undefined,
        });
        return jsonResponse(await readModel.listAgentThreadMessages(query));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/thread-messages failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/ltm-thread-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/ltm-thread-messages',
    handler: async (request) => {
      try {
        const query = agentThreadMessagesQuerySchema.parse({
          agentId: request.query.get('agentId'),
          page: request.query.get('page') ?? undefined,
          perPage: request.query.get('perPage') ?? undefined,
        });
        return jsonResponse(
          await readModel.listAgentLongTermMemoryThreadMessages({
            agentId: query.agentId,
            page: query.page,
            perPage: query.perPage,
          }),
        );
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/ltm-thread-messages failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/runtime-memory
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/runtime-memory',
    handler: async (request) => {
      try {
        const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
        return jsonResponse(await readModel.getAgentRuntimeMemory(agentId));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/runtime-memory failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/om-debug-export
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/om-debug-export',
    handler: async (request) => {
      try {
        const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
        return jsonResponse(await readModel.getAgentOmDebugExport(agentId));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/om-debug-export failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/conversation-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/conversation-messages',
    handler: async (request) => {
      try {
        const query = agentConversationMessagesQuerySchema.parse({
          agentId: request.query.get('agentId'),
          provider: request.query.get('provider'),
          targetKey: request.query.get('targetKey'),
          limit: request.query.get('limit') ?? undefined,
          offset: request.query.get('offset') ?? undefined,
        });
        return jsonResponse(
          await readModel.listAgentConversationMessages({
            agentId: query.agentId,
            provider: query.provider,
            targetKey: query.targetKey,
            limit: query.limit,
            offset: query.offset,
          }),
        );
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/conversation-messages failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/agent/ltm-recall-search
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/ltm-recall-search',
    handler: async (request) => {
      try {
        const { agentId, query } = agentLongTermMemoryRecallSearchSchema.parse({
          agentId: request.query.get('agentId'),
          query: request.query.get('query'),
        });
        return jsonResponse(await readModel.debugAgentLongTermMemoryRecallSearch(agentId, { query }));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'GET /admin/agent/ltm-recall-search failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
}