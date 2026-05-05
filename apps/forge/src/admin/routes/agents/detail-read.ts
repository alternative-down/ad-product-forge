/**
 * Agent Detail Sub-Resource Routes - #1587
 * Fragmented routes for /admin/agents/:id/sub-resources
 *
 * Replaces the monolithic GET /admin/agent (which fetches 7 DB queries in parallel).
 * Each route fetches only the data it needs.
 */

import type { HttpHandler } from '../../../http/server.js';
import { jsonResponse } from '../index';

interface AgentDetailReadModel {
  listAgentExecutionSteps: (query: { agentId: string; limit: number; offset: number }) => Promise<unknown>;
  listAgentRecentConversations: (agentId: string) => Promise<unknown>;
  getAgentRuntimeMemory: (agentId: string) => Promise<unknown>;
  listRecentAgentHomeMetricSnapshots: (input: { agentId: string; limit: number }) => Promise<unknown>;
}

interface AgentContractsReadModel {
  listAgentContracts: (agentId: string) => Promise<unknown>;
}

interface AgentMcpReadModel {
  listAgentMcpServers: (agentId: string) => Promise<unknown>;
}

interface AgentSchedulesReadModel {
  listAgentSchedules: (agentId: string) => Promise<unknown>;
}

interface AgentNotificationsReadModel {
  listAgentNotifications: (agentId: string) => Promise<unknown>;
}

function extractAgentId(path: string): string {
  // Extract agentId from /admin/agents/:agentId/...
  const match = path.match(/^\/admin\/agents\/([^/]+)/);
  return match ? match[1] : '';
}

// ─── Agent Execution Steps ───────────────────────────────────────────────────

export function registerAgentStepsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/steps',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      const offset = parseInt(request.query.get('offset') ?? '0', 10);
      return jsonResponse(
        await readModel.listAgentExecutionSteps({ agentId, limit, offset }),
      );
    },
  });
}

// ─── Agent Conversations ─────────────────────────────────────────────────────

export function registerAgentConversationsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/conversations',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      return jsonResponse(await readModel.listAgentRecentConversations(agentId));
    },
  });
}

// ─── Agent Runtime Memory ───────────────────────────────────────────────────

export function registerAgentMemoryRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/memory',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      return jsonResponse(await readModel.getAgentRuntimeMemory(agentId));
    },
  });
}

// ─── Agent Metrics ───────────────────────────────────────────────────────────

export function registerAgentMetricsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/metrics',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      return jsonResponse(
        await readModel.listRecentAgentHomeMetricSnapshots({ agentId, limit }),
      );
    },
  });
}

// ─── Agent Contracts ────────────────────────────────────────────────────────

export function registerAgentContractRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentContractsReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/contract',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      return jsonResponse(await readModel.listAgentContracts(agentId));
    },
  });
}

// ─── Agent MCP Servers ───────────────────────────────────────────────────────

export function registerAgentMcpRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentMcpReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/mcp',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      return jsonResponse(await readModel.listAgentMcpServers(agentId));
    },
  });
}

// ─── Agent Schedules ────────────────────────────────────────────────────────

export function registerAgentSchedulesRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentSchedulesReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/schedules',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      return jsonResponse(await readModel.listAgentSchedules(agentId));
    },
  });
}

// ─── Agent Notifications ────────────────────────────────────────────────────

export function registerAgentNotificationsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentNotificationsReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/notifications',
    handler: async (request) => {
      const agentId = extractAgentId(request.path);
      return jsonResponse(await readModel.listAgentNotifications(agentId));
    },
  });
}