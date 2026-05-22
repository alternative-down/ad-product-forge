import { asc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../database/schema';
import {
  agents,
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../agents/agent-runner-error-formatting';

function debug(scope: string, level: 'error' | 'warn' | 'info', message: string, context?: Record<string, unknown>) {
  forgeDebug({ scope, level, message, context });
}

export async function queryRoles(db: Database) {
  try {
    return await db.query.agentRoles.findMany({
      orderBy: [asc(agentRoles.name)],
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryRoles failed: ' + String(serializeError(err)));
    return [];
  }
}

export async function queryRole(db: Database, roleId: string) {
  try {
    return await db.query.agentRoles.findFirst({
      where: eq(agentRoles.id, roleId),
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryRole failed: ' + String(serializeError(err)));
    return null;
  }
}

export async function queryToolPermissions(db: Database, roleId: string) {
  try {
    return await db.query.roleToolPermissions.findMany({
      where: eq(roleToolPermissions.roleId, roleId),
      orderBy: [asc(roleToolPermissions.toolId)],
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryToolPermissions failed: ' + String(serializeError(err)));
    return [];
  }
}

export async function queryWorkflowPermissions(db: Database, roleId: string) {
  try {
    return await db.query.roleWorkflowPermissions.findMany({
      where: eq(roleWorkflowPermissions.roleId, roleId),
      orderBy: [asc(roleWorkflowPermissions.workflowId)],
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryWorkflowPermissions failed: ' + String(serializeError(err)));
    return [];
  }
}

export async function queryAgentsByRoleId(db: Database, roleId: string) {
  try {
    return await db.query.agents.findFirst({
      where: eq(agents.roleId, roleId),
      columns: { id: true },
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryAgentsByRoleId failed: ' + String(serializeError(err)));
    throw err;
  }
}

export async function queryAgent(db: Database, agentId: string) {
  try {
    return await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryAgent failed: ' + String(serializeError(err)));
    throw err;
  }
}

export async function queryAgents(db: Database, input: {
  agentId?: string | null;
  executionState?: 'idle' | 'running' | 'absent';
}) {
  try {
    return await db.query.agents.findMany({
      where: (agent, { and, eq }) => {
        const filters = [];
        if (input.agentId !== null && input.agentId !== undefined) {
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
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryAgents failed: ' + String(serializeError(err)));
    return [];
  }
}

export async function queryToolPermissionsBatch(db: Database, roleIds: string[]) {
  if (roleIds.length === 0) return [];
  try {
    return await db.query.roleToolPermissions.findMany({
      where: inArray(roleToolPermissions.roleId, roleIds),
      orderBy: [asc(roleToolPermissions.roleId), asc(roleToolPermissions.toolId)],
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryToolPermissionsBatch failed: ' + String(serializeError(err)));
    throw err;
  }
}

export async function queryWorkflowPermissionsBatch(db: Database, roleIds: string[]) {
  if (roleIds.length === 0) return [];
  try {
    return await db.query.roleWorkflowPermissions.findMany({
      where: inArray(roleWorkflowPermissions.roleId, roleIds),
      orderBy: [asc(roleWorkflowPermissions.roleId), asc(roleWorkflowPermissions.workflowId)],
    });
  } catch (err) {
    debug('capabilities-queries', 'error', 'queryWorkflowPermissionsBatch failed: ' + String(serializeError(err)));
    throw err;
  }
}