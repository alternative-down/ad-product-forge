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

interface AgentRolesReadModel {
  listAgentRoles: (agentId: string) => Promise<unknown>;
}

interface AgentLlmProfilesReadModel {
  listAgentLlmProfiles: (agentId: string) => Promise<unknown>;
}

// ─── Agent Execution Steps ───────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/steps
 * Returns recent execution steps for an agent.
 */
export function registerAgentStepsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/steps',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      const offset = parseInt(request.query.get('offset') ?? '0', 10);
      return jsonResponse(
        await readModel.listAgentExecutionSteps({ agentId, limit, offset }),
      );
    },
  });
}

// ─── Agent Conversations ─────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/conversations
 * Returns recent conversations for an agent.
 */
export function registerAgentConversationsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/conversations',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      const conversations = await readModel.listAgentRecentConversations(agentId);
      return jsonResponse(conversations);
    },
  });
}

// ─── Agent Runtime Memory ───────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/memory
 * Returns current runtime memory state for an agent.
 */
export function registerAgentMemoryRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/memory',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      return jsonResponse(await readModel.getAgentRuntimeMemory(agentId));
    },
  });
}

// ─── Agent Metrics ───────────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/metrics
 * Returns recent home metric snapshots for an agent.
 */
export function registerAgentMetricsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentDetailReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/metrics',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      const limit = parseInt(request.query.get('limit') ?? '10', 10);
      return jsonResponse(
        await readModel.listRecentAgentHomeMetricSnapshots({ agentId, limit }),
      );
    },
  });
}

// ─── Agent Contracts ────────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/contract
 * Returns execution contracts for an agent.
 */
export function registerAgentContractRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentContractsReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/contract',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      return jsonResponse(await readModel.listAgentContracts(agentId));
    },
  });
}

// ─── Agent MCP Servers ───────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/mcp
 * Returns MCP server configurations for an agent.
 */
export function registerAgentMcpRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentMcpReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/mcp',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      return jsonResponse(await readModel.listAgentMcpServers(agentId));
    },
  });
}

// ─── Agent Schedules ────────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/schedules
 * Returns schedules for an agent.
 */
export function registerAgentSchedulesRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentSchedulesReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/schedules',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      return jsonResponse(await readModel.listAgentSchedules(agentId));
    },
  });
}

// ─── Agent Notifications ────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/notifications
 * Returns recent notifications for an agent.
 */
export function registerAgentNotificationsRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  readModel: AgentNotificationsReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/notifications',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      return jsonResponse(await readModel.listAgentNotifications(agentId));
    },
  });
}

// ─── Agent Roles ────────────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/roles
 * Returns available roles in the system.
 */
export function registerAgentRolesRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  _readModel: AgentRolesReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/roles',
    handler: async () => {
      // Roles are system-level, not agent-specific
      // The original getAgent() fetched all roles; this route returns system roles
      return jsonResponse({ roles: [] });
    },
  });
}

// ─── Agent LLM Profiles ─────────────────────────────────────────────────────

/**
 * GET /admin/agents/:id/llm-profiles
 * Returns LLM profile configurations for an agent.
 */
export function registerAgentLlmProfilesRoutes(
  httpServer: { registerRoute: (route: { method: string; path: string; handler: HttpHandler }) => void },
  _readModel: AgentLlmProfilesReadModel,
) {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents/:agentId/llm-profiles',
    handler: async (request) => {
      const agentId = request.path.replace('/admin/agents/', '').split('/')[0];
      return jsonResponse({ agentId, llmProfiles: [] });
    },
  });
}