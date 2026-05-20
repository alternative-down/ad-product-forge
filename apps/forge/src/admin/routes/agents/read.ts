/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

import { ZodError } from 'zod';
import { forgeDebug } from '../debug';
import { jsonResponse } from '../index';
import {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
} from '../schemas/agents';

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

export function registerAgentReadRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: ReadModel
) {
  // GET /admin/agents
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => {
      try {
        return jsonResponse(await readModel.listAgents());
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent list route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
        if (agent === null || agent === undefined) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
        return jsonResponse(agent);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent get route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
        if (conversations === null || conversations === undefined) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
        return jsonResponse(conversations);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent conversations route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent execution-steps route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent thread-messages route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent ltm-thread-messages route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
        const snapshot = await readModel.getAgentRuntimeMemory(agentId);
        if (snapshot === null || snapshot === undefined) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
        return jsonResponse(snapshot);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent runtime-memory route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
        const snapshot = await readModel.getAgentOmDebugExport(agentId);
        if (snapshot === null || snapshot === undefined) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
        return jsonResponse(snapshot);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent om-debug-export route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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
      } catch (err) {
        if (err instanceof ZodError) throw err;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent conversation-messages route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}
