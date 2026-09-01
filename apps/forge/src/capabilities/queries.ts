import { asc, eq, inArray } from 'drizzle-orm';
import { errorMsg } from '../agents/error-formatting';

import type { Database } from '../database/client';
import {
  agents,
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

function debug(scope: string, level: 'error' | 'warn' | 'info', message: string, context?: Record<string, unknown>) {
  forgeDebug({ scope, level, message, context });
}

// L#19 invariant (queries.ts): every exported query function MUST go through
// `safeQuery`. The 8 pre-existing functions all wrapped raw try/catch with 3
// inconsistent error patterns (return [] / return null / rethrow), so the
// caller could not predict behavior. After #5630, safeQuery is the ONLY
// allowed wrapper. Direct try/catch in queries.ts is BANNED — enforced by
// `queries.lnn-13-tripwire.test.ts`.
async function safeQuery<T>(
  scope: string,
  queryName: string,
  fn: () => Promise<T>,
  fallback: T | (() => T),
  onError: 'return-fallback' | 'throw' = 'return-fallback',
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    debug(scope, 'error', `${queryName} failed: ` + errorMsg(err));
    if (onError === 'throw') throw err;
    return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
  }
}

export async function queryRoles(db: Database) {
  return await safeQuery(
    'capabilities-queries',
    'queryRoles',
    () => db.query.agentRoles.findMany({
      orderBy: [asc(agentRoles.name)],
    }),
    [],
  );
}

export async function queryRole(db: Database, roleId: string) {
  return await safeQuery(
    'capabilities-queries',
    'queryRole',
    () => db.query.agentRoles.findFirst({
      where: eq(agentRoles.id, roleId),
    }),
    null,
  );
}

export async function queryToolPermissions(db: Database, roleId: string) {
  return await safeQuery(
    'capabilities-queries',
    'queryToolPermissions',
    () => db.query.roleToolPermissions.findMany({
      where: eq(roleToolPermissions.roleId, roleId),
      orderBy: [asc(roleToolPermissions.toolId)],
    }),
    [],
  );
}

export async function queryWorkflowPermissions(db: Database, roleId: string) {
  return await safeQuery(
    'capabilities-queries',
    'queryWorkflowPermissions',
    () => db.query.roleWorkflowPermissions.findMany({
      where: eq(roleWorkflowPermissions.roleId, roleId),
      orderBy: [asc(roleWorkflowPermissions.workflowId)],
    }),
    [],
  );
}

export async function queryAgentsByRoleId(db: Database, roleId: string) {
  return await safeQuery(
    'capabilities-queries',
    'queryAgentsByRoleId',
    () => db.query.agents.findFirst({
      where: eq(agents.roleId, roleId),
      columns: { id: true },
    }),
    null,
    'throw',
  );
}

export async function queryAgent(db: Database, agentId: string) {
  return await safeQuery(
    'capabilities-queries',
    'queryAgent',
    () => db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    }),
    null,
    'throw',
  );
}

export async function queryAgents(db: Database, input: {
  agentId?: string | null;
  executionState?: 'idle' | 'running' | 'absent';
}) {
  return await safeQuery(
    'capabilities-queries',
    'queryAgents',
    () => db.query.agents.findMany({
      where: (agent, { and, eq }) => {
        const filters = [];
        if (input.agentId != null) {
          filters.push(eq(agent.id, input.agentId));
        }
        if (input.executionState) {
          filters.push(eq(agent.executionState, input.executionState));
        }
        if (filters.length === 0) {
          return undefined;
        }
        return and(...filters);
      },
      orderBy: [asc(agents.name)],
      with: {
        role: {
          columns: {
            name: true,
            description: true,
          },
        },
      },
    }),
    [],
  );
}

export async function queryToolPermissionsBatch(db: Database, roleIds: string[]) {
  if (roleIds.length === 0) return [];
  return await safeQuery(
    'capabilities-queries',
    'queryToolPermissionsBatch',
    () => db.query.roleToolPermissions.findMany({
      where: inArray(roleToolPermissions.roleId, roleIds),
      orderBy: [asc(roleToolPermissions.roleId), asc(roleToolPermissions.toolId)],
    }),
    [],
    'throw',
  );
}

export async function queryWorkflowPermissionsBatch(db: Database, roleIds: string[]) {
  if (roleIds.length === 0) return [];
  return await safeQuery(
    'capabilities-queries',
    'queryWorkflowPermissionsBatch',
    () => db.query.roleWorkflowPermissions.findMany({
      where: inArray(roleWorkflowPermissions.roleId, roleIds),
      orderBy: [asc(roleWorkflowPermissions.roleId), asc(roleWorkflowPermissions.workflowId)],
    }),
    [],
    'throw',
  );
}
