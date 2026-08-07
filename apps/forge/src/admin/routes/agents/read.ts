/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

import type { ForgeHttpServerAdapter } from '../../../http/server';
import { jsonResponse } from '../index';
import {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
} from '../schemas/agents';
import { labeledRoute } from './admin-route-error-helper';

interface ReadModel {
  listAgents: () => Promise<unknown>;
  getAgent: (id: string) => Promise<unknown>;
  listAgentRecentConversations: (id: string) => Promise<unknown>;
  listAgentExecutionSteps: (query: {
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
  getAgentRuntimeMemory: (id: string) => Promise<unknown>;
  getAgentOmDebugExport: (id: string) => Promise<unknown>;
  debugAgentLongTermMemoryRecallSearch: (
    agentId: string,
    opts: { query: string },
  ) => Promise<unknown>;
  listAgentConversationMessages: (params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) => Promise<unknown>;
}

export function registerAgentReadRoutes(
  httpServer: ForgeHttpServerAdapter,
  readModel: ReadModel,
) {
  // GET /admin/agents
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: labeledRoute('Agent list route', async () => {
      return jsonResponse(await readModel.listAgents());
    
}),
  });

  // GET /admin/agent
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: labeledRoute('Agent get route', async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const agent = await readModel.getAgent(agentId);
      if (agent === null || agent === undefined)
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(agent);
    
}),
  });

  // GET /admin/agent/recent-conversations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/recent-conversations',
    handler: labeledRoute('Agent conversations route', async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const conversations = await readModel.listAgentRecentConversations(agentId);
      if (conversations === null || conversations === undefined)
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(conversations);
    
}),
  });

  // GET /admin/agent/execution-steps
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/execution-steps',
    handler: labeledRoute('Agent execution-steps route', async (request) => {
      const query = agentExecutionStepsQuerySchema.parse({
        agentId: request.query.get('agentId'),
        limit: request.query.get('limit') ?? undefined,
        offset: request.query.get('offset') ?? undefined,
      });
      return jsonResponse(await readModel.listAgentExecutionSteps(query));
    
}),
  });

  // GET /admin/agent/thread-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/thread-messages',
    handler: labeledRoute('Agent thread-messages route', async (request) => {
      const query = agentThreadMessagesQuerySchema.parse({
        agentId: request.query.get('agentId'),
        page: request.query.get('page') ?? undefined,
        perPage: request.query.get('perPage') ?? undefined,
      });
      return jsonResponse(await readModel.listAgentThreadMessages(query));
    
}),
  });

  // GET /admin/agent/ltm-thread-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/ltm-thread-messages',
    handler: labeledRoute('Agent ltm-thread-messages route', async (request) => {
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
    
}),
  });

  // GET /admin/agent/runtime-memory
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/runtime-memory',
    handler: labeledRoute('Agent runtime-memory route', async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const snapshot = await readModel.getAgentRuntimeMemory(agentId);
      if (snapshot === null || snapshot === undefined)
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(snapshot);
    
}),
  });

  // GET /admin/agent/om-debug-export
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/om-debug-export',
    handler: labeledRoute('Agent om-debug-export route', async (request) => {
      const { agentId } = agentIdQuerySchema.parse({ agentId: request.query.get('agentId') });
      const snapshot = await readModel.getAgentOmDebugExport(agentId);
      if (snapshot === null || snapshot === undefined)
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(snapshot);
    
}),
  });

  // GET /admin/agent/conversation-messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/conversation-messages',
    handler: labeledRoute('Agent conversation-messages route', async (request) => {
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
    
}),
  });
}
