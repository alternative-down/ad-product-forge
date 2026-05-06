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
} from '../schemas';
import { jsonResponse, parseJsonBody } from '../index';

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
    handler: async () => jsonResponse(await readModel.listAgents()),
  });

  // GET /admin/agent
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const agent = await readModel.getAgent(agentId);
      if (!agent) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(agent);
    },
  });

  // GET /admin/agent/recent-conversations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/recent-conversations',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const conversations = await readModel.listAgentRecentConversations(agentId);
      if (!conversations) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(conversations);
    },
  });

  // GET /admin/agent/execution-steps
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/execution-steps',
    handler: async (request) => {
      const query = agentExecutionStepsQuerySchema.parse({
        agentId: request.query.get('agentId'),
        limit: request.query.get('limit') ?? undefined,
        offset: request.query.get('offset') ?? undefined,
      });
      return jsonResponse(await readModel.listAgentExecutionSteps(query));
    },
  });

  // GET /admin/agent/thread-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/thread-messages',
    handler: async (request) => {
      const query = agentThreadMessagesQuerySchema.parse({
        agentId: request.query.get('agentId'),
        page: request.query.get('page') ?? undefined,
        perPage: request.query.get('perPage') ?? undefined,
      });
      return jsonResponse(await readModel.listAgentThreadMessages(query));
    },
  });

  // GET /admin/agent/ltm-thread-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/ltm-thread-messages',
    handler: async (request) => {
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
    },
  });

  // GET /admin/agent/runtime-memory
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/runtime-memory',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const snapshot = await readModel.getAgentRuntimeMemory(agentId);
      if (!snapshot) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(snapshot);
    },
  });

  // GET /admin/agent/om-debug-export
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/om-debug-export',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const snapshot = await readModel.getAgentOmDebugExport(agentId);
      if (!snapshot) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(snapshot);
    },
  });

  // GET /admin/agent/conversation-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/conversation-messages',
    handler: async (request) => {
      const query = agentConversationMessagesQuerySchema.parse({
        agentId: request.query.get('agentId'),
        provider: request.query.get('provider'),
        targetKey: request.query.get('targetKey'),
        limit: request.query.get('limit') ?? undefined,
        offset: request.query.get('offset') ?? undefined,
      });
      return jsonResponse(await readModel.listAgentConversationMessages(query));
    },
  });
}