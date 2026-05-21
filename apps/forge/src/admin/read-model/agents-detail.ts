/**
 * Agent detail read model — extracted from agents.ts (phase 5b).
 * Covers: listAgentContracts, listAgentSchedules, listAgentNotifications,
 * listAgentMcpServers, listAgentLlmProfiles.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../../agents/agent-runner-error-formatting';
import { desc, eq, inArray } from 'drizzle-orm';
import {
  agentExecutionContracts,
  agentMcpConfigs,
  agentNotifications,
  agentSchedules,
  agents,
  llmProfiles,
  mcpServerConfigs,
} from '../../database/schema';
import { toScheduleSummary as toScheduleSummaryHelper } from './helpers';
import type { Database } from '../../database/index';

export interface AgentDetailReadModelDeps {
  db: Database;
}

export function createAgentDetailReadModel(deps: AgentDetailReadModelDeps) {
  const { db } = deps;

  async function listAgentContracts(agentId: string) {
    let rows;
    try {
      rows = await db.query.agentExecutionContracts.findMany({
        where: eq(agentExecutionContracts.agentId, agentId),
        orderBy: desc(agentExecutionContracts.startsAt),
      });
    } catch (err) {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'error',
        message: 'listAgentContracts failed',
        context: { agentId, error: String(serializeError(err)) },
      });
      throw err;
    }
    return rows.map((row) => {
      const { id, ...rest } = row;
      return { ...rest, contractId: id };
    });
  }

  async function listAgentSchedules(agentId: string) {
    let rows;
    try {
      rows = await db.query.agentSchedules.findMany({
        where: eq(agentSchedules.agentId, agentId),
        orderBy: desc(agentSchedules.nextTriggerAt),
      });
    } catch (err) {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'error',
        message: 'listAgentSchedules failed',
        context: { agentId, error: String(serializeError(err)) },
      });
      throw err;
    }
    return rows.map((row) => toScheduleSummaryHelper(row));
  }

  async function listAgentNotifications(agentId: string) {
    let rows;
    try {
      rows = await db.query.agentNotifications.findMany({
        where: eq(agentNotifications.agentId, agentId),
        orderBy: desc(agentNotifications.createdAt),
        limit: 50,
      });
    } catch (err) {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'error',
        message: 'listAgentNotifications failed',
        context: { agentId, error: String(serializeError(err)) },
      });
      throw err;
    }
    return rows.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      readAt: n.readAt,
    }));
  }

  async function listAgentMcpServers(agentId: string) {
    let rows;
    try {
      rows = await db.query.agentMcpConfigs.findMany({
        where: eq(agentMcpConfigs.agentId, agentId),
      });
    } catch (err) {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'error',
        message: 'listAgentMcpServers failed (query configs)',
        context: { agentId, error: String(serializeError(err)) },
      });
      throw err;
    }
    const serverIds = rows.map((r) => r.serverId).filter(Boolean);
    let servers: {
      id: string;
      name: string;
      description?: string | null;
      transport: string;
      command?: string | null;
      args?: string | null;
      envVars?: string | null;
      url?: string | null;
      headers?: string | null;
      createdAt: unknown;
      updatedAt: unknown;
    }[];
    if (serverIds.length > 0) {
      try {
        servers = await db.query.mcpServerConfigs.findMany({
          where: inArray(mcpServerConfigs.id, serverIds),
        });
      } catch (err) {
        forgeDebug({
          scope: 'admin-read-model',
          level: 'error',
          message: 'listAgentMcpServers failed (query servers)',
          context: { agentId, error: String(serializeError(err)) },
        });
        throw err;
      }
    } else {
      servers = [];
    }
    const serverIdToLink = new Map(rows.map((link) => [link.serverId, link]));
    return servers.map((server) => {
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
        isActive: link?.isActive === 1,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
      };
    });
  }

  async function listAgentLlmProfiles(agentId: string) {
    let agent;
    try {
      agent = await db.query.agents.findFirst({
        where: eq(agents.id, agentId),
        columns: { modelProfileId: true, omModelProfileId: true },
      });
    } catch (err) {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'error',
        message: 'listAgentLlmProfiles failed (query agent)',
        context: { agentId, error: String(serializeError(err)) },
      });
      throw err;
    }
    if (agent === null || agent === undefined) return { profiles: [] };
    const profileIds = [agent.modelProfileId, agent.omModelProfileId].filter(Boolean);
    if (profileIds.length === 0) return { profiles: [] };
    let profiles;
    try {
      profiles = await db.query.llmProfiles.findMany({
        where: inArray(llmProfiles.id, profileIds),
      });
    } catch (err) {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'error',
        message: 'listAgentLlmProfiles failed (query profiles)',
        context: { agentId, error: String(serializeError(err)) },
      });
      throw err;
    }
    return { profiles };
  }

  return {
    listAgentContracts,
    listAgentSchedules,
    listAgentNotifications,
    listAgentMcpServers,
    listAgentLlmProfiles,
  };
}
