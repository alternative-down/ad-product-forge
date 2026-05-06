import { createId } from '../utils/id';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import {
  agents,
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { forgeCapabilityIds, normalizeToolPermissionIds } from './catalog';
import { AGENT_BASE_TOOL_IDS } from '../agents/base-tool-ids';
import { forgeDebug } from '@forge-runtime/core';

type CapabilitySet = {
  toolIds: string[];
};

const roleInspectionToolIds = [
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const;

function resolveLoadedToolIds(toolIds: string[]) {
  const resolvedToolIds = new Set(toolIds);
  const hasCrossAgentCronTools = resolvedToolIds.has('manage_crons') || resolvedToolIds.has('list_crons');
  const hasCrossAgentRoleTool = resolvedToolIds.has('change_agent_role');
  const hasRoleInspectionTool = roleInspectionToolIds.some((toolId) => resolvedToolIds.has(toolId));

  if (hasRoleInspectionTool) {
    resolvedToolIds.add('list_agent_roles');
  }

  if (resolvedToolIds.has('manage_role_capabilities')) {
    resolvedToolIds.add('list_role_capabilities');
  }

  if (!hasCrossAgentCronTools && !hasCrossAgentRoleTool) {
    return [...resolvedToolIds].sort((left, right) => left.localeCompare(right));
  }

  return [...resolvedToolIds]
    .filter((toolId) => {
      if (hasCrossAgentCronTools && (toolId === 'manage_self_crons' || toolId === 'list_self_crons')) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.localeCompare(right));
}

export function createCapabilityStore(db: Database) {
  async function listRoles() {
    let rows;
    try {
      rows = await db.query.agentRoles.findMany({
        orderBy: [asc(agentRoles.name)],
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'listRoles DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return rows.map((row) => ({
      roleId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async function getRole(roleId: string) {
    let row;
    try {
      row = await db.query.agentRoles.findFirst({
        where: eq(agentRoles.id, roleId),
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'getRole DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }

    if (!row) {
      return null;
    }

    return {
      roleId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async function createRole(input: { name: string; description?: string }) {
    const now = Date.now();
    const record = {
      id: createId(),
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(agentRoles).values(record);
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'createRole DB insert failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    try {
      await Promise.all(
        AGENT_BASE_TOOL_IDS.map((toolId) => addRoleToolPermission({
          roleId: record.id,
          toolId,
        })),
      );
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'createRole add base tools failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    return {
      roleId: record.id,
      name: record.name,
      description: input.description,
    };
  }

  async function updateRole(input: { roleId: string; name?: string; description?: string | null }) {
    let existing;
    try {
      existing = await db.query.agentRoles.findFirst({
        where: eq(agentRoles.id, input.roleId),
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'updateRole read existing failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    if (!existing) {
      throw new Error(`Role not found: ${input.roleId}`);
    }

    try {
      await db
        .update(agentRoles)
        .set({
          name: input.name ?? existing.name,
          description: input.description === undefined ? existing.description : input.description,
          updatedAt: Date.now(),
        })
        .where(eq(agentRoles.id, input.roleId));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'updateRole DB update failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    return {
      roleId: existing.id,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description ?? undefined : input.description ?? undefined,
    };
  }

  async function deleteRole(roleId: string) {
    let assignedAgent;
    try {
      assignedAgent = await db.query.agents.findFirst({
        where: eq(agents.roleId, roleId),
        columns: {
          id: true,
        },
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'deleteRole check assigned agent failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    if (assignedAgent) {
      throw new Error(`Cannot delete role with assigned agents: ${roleId}`);
    }

    try {
      await db.delete(roleToolPermissions).where(eq(roleToolPermissions.roleId, roleId));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'deleteRole remove tool permissions failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    try {
      await db.delete(roleWorkflowPermissions).where(eq(roleWorkflowPermissions.roleId, roleId));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'deleteRole remove workflow permissions failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    try {
      await db.delete(agentRoles).where(eq(agentRoles.id, roleId));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'deleteRole DB delete failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    return { roleId, success: true };
  }

  async function listRoleToolPermissions(roleId: string) {
    let rows;
    try {
      rows = await db.query.roleToolPermissions.findMany({
        where: eq(roleToolPermissions.roleId, roleId),
        orderBy: [asc(roleToolPermissions.toolId)],
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'listRoleToolPermissions DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return resolveLoadedToolIds(normalizeToolPermissionIds(rows.map((row) => row.toolId)));
  }

  async function addRoleToolPermission(input: { roleId: string; toolId: string }) {
    try {
      await db
        .insert(roleToolPermissions)
        .values({
          roleId: input.roleId,
          toolId: input.toolId,
          createdAt: Date.now(),
        })
        .onConflictDoNothing();
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'addRoleToolPermission DB insert failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    }

    return {
      roleId: input.roleId,
      toolId: input.toolId,
    };
  }

  async function removeRoleToolPermission(input: { roleId: string; toolId: string }) {
    try {
      await db
        .delete(roleToolPermissions)
        .where(and(eq(roleToolPermissions.roleId, input.roleId), eq(roleToolPermissions.toolId, input.toolId)));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'removeRoleToolPermission DB delete failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    }

    return {
      roleId: input.roleId,
      toolId: input.toolId,
      success: true,
    };
  }

  async function listRoleWorkflowPermissions(roleId: string) {
    let rows;
    try {
      rows = await db.query.roleWorkflowPermissions.findMany({
        where: eq(roleWorkflowPermissions.roleId, roleId),
        orderBy: [asc(roleWorkflowPermissions.workflowId)],
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'listRoleWorkflowPermissions DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return rows.map((row) => row.workflowId);
  }

  async function addRoleWorkflowPermission(input: { roleId: string; workflowId: string }) {
    try {
      await db
        .insert(roleWorkflowPermissions)
        .values({
          roleId: input.roleId,
          workflowId: input.workflowId,
          createdAt: Date.now(),
        })
        .onConflictDoNothing();
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'addRoleWorkflowPermission DB insert failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    }

    return {
      roleId: input.roleId,
      workflowId: input.workflowId,
    };
  }

  async function removeRoleWorkflowPermission(input: { roleId: string; workflowId: string }) {
    try {
      await db
        .delete(roleWorkflowPermissions)
        .where(and(eq(roleWorkflowPermissions.roleId, input.roleId), eq(roleWorkflowPermissions.workflowId, input.workflowId)));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'removeRoleWorkflowPermission DB delete failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    }

    return {
      roleId: input.roleId,
      workflowId: input.workflowId,
      success: true,
    };
  }

  async function listGrantedRoleCapabilities(roleId: string) {
    const [toolIds, workflowIds] = await Promise.all([
      listRoleToolPermissions(roleId),
      listRoleWorkflowPermissions(roleId),
    ]);

    return [...new Set([...toolIds, ...workflowIds])].sort((left, right) => left.localeCompare(right));
  }

  async function listRoleCapabilities(roleId: string) {
    const grantedCapabilityIds = new Set(await listGrantedRoleCapabilities(roleId));

    return [...forgeCapabilityIds]
      .sort((left, right) => left.localeCompare(right))
      .map((capabilityId) => ({
        capabilityId,
        granted: grantedCapabilityIds.has(capabilityId),
      }));
  }

  async function manageRole(input: {
    action: 'create' | 'update' | 'delete';
    roleId?: string;
    name?: string;
    description?: string | null;
  }) {
    if (input.action === 'create') {
      if (!input.name?.trim()) {
        throw new Error('Role name is required.');
      }

      return createRole({
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
      });
    }

    if (input.action === 'delete') {
      if (!input.roleId) {
        throw new Error('roleId is required.');
      }

      return deleteRole(input.roleId);
    }

    if (!input.roleId) {
      throw new Error('roleId is required.');
    }

    if (!input.name && input.description === undefined) {
      throw new Error('At least one field besides roleId must be provided.');
    }

    return updateRole({
      roleId: input.roleId,
      name: input.name?.trim(),
      description: input.description === undefined ? undefined : (input.description?.trim() || null),
    });
  }

  async function manageRoleCapability(input: {
    action: 'add' | 'remove';
    roleId: string;
    capabilityId: string;
  }) {
    const isWorkflow = input.capabilityId.startsWith('wf-');
    if (input.action === 'add') {
      return isWorkflow
        ? addRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.capabilityId })
        : addRoleToolPermission({ roleId: input.roleId, toolId: input.capabilityId });
    } else {
      return isWorkflow
        ? removeRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.capabilityId })
        : removeRoleToolPermission({ roleId: input.roleId, toolId: input.capabilityId });
    }
  }

  async function getAgentCapabilities(agentId: string): Promise<CapabilitySet> {
    let agent;
    try {
      agent = await db.query.agents.findFirst({
        where: eq(agents.id, agentId),
      });
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'getAgentCapabilities DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agent.roleId) {
      throw new Error(`Agent is missing roleId: ${agentId}`);
    }

    return {
      toolIds: resolveLoadedToolIds([
        ...(await listRoleToolPermissions(agent.roleId)),
        ...(await listRoleWorkflowPermissions(agent.roleId)),
      ]),
    };
  }

  async function listAgentStatuses(input: {
    agentId?: string;
    executionState?: 'idle' | 'running' | 'absent';
  }) {
    let rows;
    try {
      rows = await db.query.agents.findMany({
        where: (agent, { and, eq }) => {
          const filters = [];

          if (input.agentId) {
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
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'listAgentStatuses DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return rows.map((row) => ({
      agentId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      roleName: row.role?.name ?? undefined,
      roleDescription: row.role?.description ?? undefined,
      executionState: row.executionState as 'idle' | 'running' | 'absent',
      updatedAt: row.updatedAt,
    }));
  }

  return {
    listRoles,
    getRole,
    createRole,
    updateRole,
    deleteRole,
    listRoleToolPermissions,
    addRoleToolPermission,
    removeRoleToolPermission,
    listRoleWorkflowPermissions,
    addRoleWorkflowPermission,
    removeRoleWorkflowPermission,
    listGrantedRoleCapabilities,
    listRoleCapabilities,
    manageRole,
    manageRoleCapability,
    getAgentCapabilities,
    listAgentStatuses,
  };
}