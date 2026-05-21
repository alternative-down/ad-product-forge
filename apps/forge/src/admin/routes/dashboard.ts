import type { HttpHandler } from '../../http/server';
import { eq } from 'drizzle-orm';
import type { Database } from '../../database/client';
import type { InternalAgentRegistry } from '../../agents/internal-agent-registry';
import { forgeDebug } from '@forge-runtime/core';
import type { createAdminReadModel } from '../read-model';
import type { createMicroErpReadModel } from '../../micro-erp/read-model';
import { jsonResponse } from './helpers';

/**
 * Dashboard analytics and overview routes.
 * Extracted from routes.ts #1874 — GET /admin/overview (analytics) and GET /admin/roles
 */
export function registerDashboardRoutes({
  httpServer,
  db,
  registry,
  finance,
  readModel,
  systemRM,
}: {
  httpServer: { registerRoute(opts: object): void };
  db: Database;
  registry: InternalAgentRegistry;
  finance: ReturnType<typeof createMicroErpReadModel>;
  readModel: ReturnType<typeof createAdminReadModel>;
  systemRM: { listRoles(): Promise<unknown> };
}) {
  // GET /admin/overview — analytics aggregation (finance + agents)
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => {
      try {
        const [balanceResult, recentResult] = await Promise.all([
          finance.getCompanyCashBalance(),
          finance.listCompanyCashMovements({ limit: 10 }),
        ]);
        const rows = await db.query.agents.findMany({
          columns: { id: true, executionState: true, role: true },
        });
        const loadedAgents = (registry as any).size;
        const idleAgents = rows.filter((r) => r.executionState === 'idle').length;
        const runningAgents = rows.filter((r) => r.executionState === 'running').length;
        return jsonResponse({
          totals: {
            agents: rows.length,
            loadedAgents,
            idleAgents,
            runningAgents,
            absentAgents: rows.filter((r) => !r.executionState || r.executionState === 'absent').length,
            roles: new Set(rows.map((r: any) => r.role).filter(Boolean)).size,
            activeContracts: (await db.query.agentExecutionContracts.findMany({
              where: (fields: any) => eq(fields.isActive, true),
              columns: { id: true },
            })).length,
          },
          cash: {
            balanceUsd: balanceResult.balanceUsd,
            summary: { income: 0, expenses: 0, net: 0 },
            recentMovements: recentResult.items,
          },
        });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Dashboard overview failed', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // GET /admin/roles — list roles via systemRM
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => {
      try {
        return jsonResponse(await systemRM.listRoles());
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/roles', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });
}
import { serializeError } from '../../agents/agent-runner-error-formatting';
