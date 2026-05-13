import { eq } from 'drizzle-orm';
import { agentExecutionContracts, agents } from '../../database/schema';

import type { Database } from '../../database/index';
import { createMicroErpReadModel } from '../../micro-erp/read-model';
import { getInternalAgentRegistry } from '../../agents/internal-agent-registry';
import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';
import { withTimeout } from '../../utils/async';

export interface AdminDashboardTotals {
  agents: number;
  loadedAgents: number;
  idleAgents: number;
  runningAgents: number;
  absentAgents: number;
  roles: number;
  activeContracts: number;
}

export interface AdminDashboardCash {
  balanceUsd: number;
  summary: { income: number; expenses: number; net: number };
  recentMovements: unknown[];
}

export interface DashboardDeps {
  db: Database;
  finance: object;
  registry: ReturnType<typeof getInternalAgentRegistry>;
}

export async function getDashboardTotals(deps: DashboardDeps): Promise<AdminDashboardTotals> {
  const { db, registry } = deps;
  const rows = await db.query.agents.findMany({ columns: { id: true, executionState: true, roleId: true } });
  const loadedAgents = registry.list().length;
  const idleAgents = rows.filter((r) => r.executionState === 'idle').length;
  const runningAgents = rows.filter((r) => r.executionState === 'running').length;
  const absentAgents = rows.filter((r) => !r.executionState || r.executionState === 'absent').length;
  const activeContracts = await db.query.agentExecutionContracts.findMany({
    where: eq(agentExecutionContracts.isActive, 1),
    columns: { id: true },
  });
  const roles = new Set(rows.map((r) => r.roleId).filter(Boolean)).size;
  return {
    agents: rows.length,
    loadedAgents,
    idleAgents,
    runningAgents,
    absentAgents,
    roles,
    activeContracts: activeContracts.length,
  };
}

const RECENT_CASH_MOVEMENT_LIMIT = 10;

export async function getDashboardCash(finance: object): Promise<AdminDashboardCash> {
  const f = finance as { getCompanyCashBalance: () => Promise<{ balanceUsd: number }>; listCompanyCashMovements: (opts: { limit: number }) => Promise<{ items: unknown[] }> };
  const [balanceResult, recentResult] = await Promise.all([
    f.getCompanyCashBalance(),
    f.listCompanyCashMovements({ limit: RECENT_CASH_MOVEMENT_LIMIT }),
  ]);
  return {
    balanceUsd: balanceResult.balanceUsd,
    summary: { income: 0, expenses: 0, net: 0 },
    recentMovements: recentResult.items,
  };
}
