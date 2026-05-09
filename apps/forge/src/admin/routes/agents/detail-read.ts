/**
 * Agent Detail Sub-Resource Routes - #1587 / #1574
 * Fragmented routes for /admin/agents/:id/sub-resources
 *
 * Refactored to create stores directly in route files (#1574).
 * Each route creates only the data-access functions it needs.
 */

import { eq, desc, inArray } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import type { HttpHandler } from '../../../http/server';

import type {Database} from '../../../database/schema';
import type { AgentReadModel } from '../../read-model/agents';
import {
  agentExecutionSteps,
  agentSchedules,
  agentNotifications,
  agentMcpConfigs,
  mcpServerConfigs,
  agentExecutionContracts,
} from '../../../database/schema';
import { jsonResponse } from '../index';

function extractAgentId(path: string): string {
  const match = path.match(/^\/admin\/agents\/([^/]+)/);
  return match ? match[1] : '';
}

// ─── Agent Base (basic agent data) ─────────────────────────────────────────

export function registerAgentBaseRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  getAgent: AgentReadModel['getAgent'],
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const agent = await getAgent(agentId);
      if (!agent) return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      return jsonResponse(agent);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Execution Steps ───────────────────────────────────────────────────

export function registerAgentStepsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  db: Database,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/steps',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      const offset = parseInt(request.query.get('offset') ?? '0', 10);
      const rows = await db.query.agentExecutionSteps.findMany({
        where: eq(agentExecutionSteps.agentId, agentId),
        orderBy: [desc(agentExecutionSteps.createdAt)],
        limit,
        offset,
      });
      return jsonResponse({ items: rows, hasMore: rows.length === limit });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/steps", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Conversations ─────────────────────────────────────────────────────

export function registerAgentConversationsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  listAgentRecentConversations: AgentReadModel['listAgentRecentConversations'],
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/conversations',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      return jsonResponse(await listAgentRecentConversations(agentId));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/conversations", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Runtime Memory ───────────────────────────────────────────────────

export function registerAgentMemoryRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  getAgentRuntimeMemory: AgentReadModel['getAgentRuntimeMemory'],
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/memory',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      return jsonResponse(await getAgentRuntimeMemory(agentId));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/memory", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Metrics ───────────────────────────────────────────────────────────

export function registerAgentMetricsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  db: Database,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/metrics',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      const rows = await db.query.agentExecutionSteps.findMany({
        where: eq(agentExecutionSteps.agentId, agentId),
        orderBy: [desc(agentExecutionSteps.createdAt)],
        limit,
      });
      return jsonResponse({ items: rows });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/metrics", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Contracts ───────────────────────────────────────────────────────────

export function registerAgentContractRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  db: Database,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/contracts',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const rows = await db.query.agentExecutionContracts.findMany({
        where: eq(agentExecutionContracts.agentId, agentId),
      });
      return jsonResponse({ items: rows });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/contracts", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent MCP Servers ───────────────────────────────────────────────────────

export function registerAgentMcpRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  db: Database,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/mcp-servers',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const agentMcpRows = await db.query.agentMcpConfigs.findMany({
        where: eq(agentMcpConfigs.agentId, agentId),
      });
      if (agentMcpRows.length === 0) return jsonResponse({ servers: [] });

      const serverIds = agentMcpRows.map((r) => r.serverId).filter(Boolean);
      const agentMcpServerRows = await db.query.mcpServerConfigs.findMany({
        where: inArray(mcpServerConfigs.id, serverIds),
      });

      const serverIdToLink = new Map(agentMcpRows.map((link) => [link.serverId, link]));
      return jsonResponse({
        servers: agentMcpServerRows.map((server) => {
          const link = serverIdToLink.get(server.id);
          return {
            configId: link?.id ?? null,
            serverId: server.id,
            name: server.name,
            description: server.description ?? undefined,
            transport: server.transport as 'stdio' | 'http_streamable',
            command: server.command ?? '',
            argsText: server.args ?? '',
            envVarsText: server.envVars ?? '',
            url: server.url ?? '',
            headersText: server.headers ?? '',
            
          };
        }),
      });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/mcp-servers", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Schedules ─────────────────────────────────────────────────────────

export function registerAgentSchedulesRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  db: Database,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/schedules',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const rows = await db.query.agentSchedules.findMany({
        where: eq(agentSchedules.agentId, agentId),
      });
      return jsonResponse({ items: rows });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/schedules", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}

// ─── Agent Notifications ─────────────────────────────────────────────────────

export function registerAgentNotificationsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  db: Database,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/notifications',
    handler: async (request) => {
      try {
      const agentId = extractAgentId(request.path);
      if (!agentId) return jsonResponse({ error: 'Missing agentId' }, 400);
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      const rows = await db.query.agentNotifications.findMany({
        where: eq(agentNotifications.agentId, agentId),
        orderBy: [desc(agentNotifications.createdAt)],
        limit,
      });
      return jsonResponse({
        items: rows.map((n) => ({
          notificationId: n.id,
          content: n.content,
          timestamp: n.createdAt,
          read: n.readAt !== null,
        })),
      });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: "/admin/agents/:agentId/notifications", context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
  });
}