import { createId } from '../utils/id';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import {
  agents,
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { forgeCapabilityIds, isWorkflowCapabilityId, normalizeToolPermissionIds } from './catalog';

type CapabilitySet = {
  toolIds: string[];
  workflowIds: string[];
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
    const rows = await db.query.agentRoles.findMany({
      orderBy: [asc(agentRoles.name)],
    });

    return rows.map((row) => ({
      roleId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async function getRole(roleId: string) {
    const row = await db.query.agentRoles.findFirst({
      where: eq(agentRoles.id, roleId),
    });

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

    await db.insert(agentRoles).values(record);

    return {
      roleId: record.id,
      name: record.name,
      description: input.description,
    };
  }

  async function updateRole(input: { roleId: string; name?: string; description?: string | null }) {
    const existing = await db.query.agentRoles.findFirst({
      where: eq(agentRoles.id, input.roleId),
    });

    if (!existing) {
      throw new Error(`Role not found: ${input.roleId}`);
    }

    await db
      .update(agentRoles)
      .set({
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        updatedAt: Date.now(),
      })
      .where(eq(agentRoles.id, input.roleId));

    return {
      roleId: existing.id,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description ?? undefined : input.description ?? undefined,
    };
  }

  async function deleteRole(roleId: string) {
    const assignedAgent = await db.query.agents.findFirst({
      where: eq(agents.roleId, roleId),
      columns: {
        id: true,
      },
    });

    if (assignedAgent) {
      throw new Error(`Cannot delete role with assigned agents: ${roleId}`);
    }

    await db.delete(roleToolPermissions).where(eq(roleToolPermissions.roleId, roleId));
    await db.delete(roleWorkflowPermissions).where(eq(roleWorkflowPermissions.roleId, roleId));
    await db.delete(agentRoles).where(eq(agentRoles.id, roleId));

    return {
      roleId,
      success: true,
    };
  }

  async function listRoleToolPermissions(roleId: string) {
    const rows = await db.query.roleToolPermissions.findMany({
      where: eq(roleToolPermissions.roleId, roleId),
      orderBy: [asc(roleToolPermissions.toolId)],
    });

    return resolveLoadedToolIds(normalizeToolPermissionIds(rows.map((row) => row.toolId)));
  }

  async function addRoleToolPermission(input: { roleId: string; toolId: string }) {
    await db
      .insert(roleToolPermissions)
      .values({
        roleId: input.roleId,
        toolId: input.toolId,
        createdAt: Date.now(),
      })
      .onConflictDoNothing();

    return {
      roleId: input.roleId,
      toolId: input.toolId,
    };
  }

  async function removeRoleToolPermission(input: { roleId: string; toolId: string }) {
    await db
      .delete(roleToolPermissions)
      .where(and(eq(roleToolPermissions.roleId, input.roleId), eq(roleToolPermissions.toolId, input.toolId)));

    return {
      roleId: input.roleId,
      toolId: input.toolId,
      success: true,
    };
  }

  async function listRoleWorkflowPermissions(roleId: string) {
    const rows = await db.query.roleWorkflowPermissions.findMany({
      where: eq(roleWorkflowPermissions.roleId, roleId),
      orderBy: [asc(roleWorkflowPermissions.workflowId)],
    });

    return rows.map((row) => row.workflowId);
  }

  async function addRoleWorkflowPermission(input: { roleId: string; workflowId: string }) {
    await db
      .insert(roleWorkflowPermissions)
      .values({
        roleId: input.roleId,
        workflowId: input.workflowId,
        createdAt: Date.now(),
      })
      .onConflictDoNothing();

    return {
      roleId: input.roleId,
      workflowId: input.workflowId,
    };
  }

  async function removeRoleWorkflowPermission(input: { roleId: string; workflowId: string }) {
    await db
      .delete(roleWorkflowPermissions)
      .where(and(eq(roleWorkflowPermissions.roleId, input.roleId), eq(roleWorkflowPermissions.workflowId, input.workflowId)));

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

    if (!input.roleId) {
      throw new Error('roleId is required.');
    }

    if (input.action === 'delete') {
      return deleteRole(input.roleId);
    }

    if (!input.name?.trim() && input.description === undefined) {
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
    if (isWorkflowCapabilityId(input.capabilityId)) {
      return input.action === 'add'
        ? addRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.capabilityId })
        : removeRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.capabilityId });
    }

    return input.action === 'add'
      ? addRoleToolPermission({ roleId: input.roleId, toolId: input.capabilityId })
      : removeRoleToolPermission({ roleId: input.roleId, toolId: input.capabilityId });
  }

  async function getAgentCapabilities(agentId: string): Promise<CapabilitySet> {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agent.roleId) {
      throw new Error(`Agent is missing roleId: ${agentId}`);
    }

    return {
      toolIds: resolveLoadedToolIds(await listRoleToolPermissions(agent.roleId)),
      workflowIds: await listRoleWorkflowPermissions(agent.roleId),
    };
  }

  async function listAgentStatuses(input: {
    agentId?: string;
    executionState?: 'idle' | 'running' | 'absent';
  }) {
    const rows = await db.query.agents.findMany({
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
