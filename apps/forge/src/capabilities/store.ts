import { createId } from '../utils/id';
import { errorMsg } from '../agents/error-formatting';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../database/client';
import {
  agents,
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { forgeCapabilityIds, normalizeToolPermissionIds } from './catalog';
import { AGENT_BASE_TOOL_IDS } from '../agents/base-tool-ids';
import { forgeDebug } from '@forge-runtime/core';
import { resolveLoadedToolIds } from './permissions';
import {
  queryRoles,
  queryRole,
  queryToolPermissions,
  queryWorkflowPermissions,
  queryAgent,
  queryAgents,
  queryToolPermissionsBatch,
  queryWorkflowPermissionsBatch,
} from './queries';

type CapabilitySet = {
  toolIds: string[];
};

export type CapabilityStore = Awaited<ReturnType<typeof createCapabilityStore>>;
export function createCapabilityStore(db: Database) {
  async function listRoles() {
    const rows = await queryRoles(db);
    return rows.map((row: any) => ({
      roleId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async function getRole(roleId: string) {
    const row = await queryRole(db, roleId);
    if (row == null) {
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
      await Promise.all(
        AGENT_BASE_TOOL_IDS.map((toolId) =>
          addRoleToolPermission({
            roleId: record.id,
            toolId,
          }),
        ),
      );
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'createRole DB write failed',
        context: { name: input.name, error: errorMsg(err) },
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
    const existing = await queryRole(db, input.roleId);
    if (existing == null) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'warn',
        message: 'requireRole: not found',
        context: { roleId: input.roleId },
      });
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
        message: 'updateRole DB write failed',
        context: { roleId: input.roleId, error: errorMsg(err) },
      });
      throw err;
    }

    return {
      roleId: existing.id,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
    };
  }

  async function deleteRole(roleId: string) {
    await db.transaction(async (tx) => {
      const assigned = await tx.query.agents.findFirst({
        where: eq(agents.roleId, roleId),
        columns: { id: true },
      });

      if (assigned != null) {
        forgeDebug({
          scope: 'capabilities-store',
          level: 'warn',
          message: 'deleteRole: cannot delete role with assigned agents',
          context: { roleId },
        });
        const err = new Error(`Cannot delete role with assigned agents: ${roleId}`) as Error & { code: 'ROLE_HAS_ASSIGNED_AGENTS' };
        err.code = 'ROLE_HAS_ASSIGNED_AGENTS';
        throw err;
      }

      await tx.delete(roleToolPermissions).where(eq(roleToolPermissions.roleId, roleId));
      await tx.delete(roleWorkflowPermissions).where(eq(roleWorkflowPermissions.roleId, roleId));
      await tx.delete(agentRoles).where(eq(agentRoles.id, roleId));
    });

    return { roleId, success: true };
  }

  async function listRoleToolPermissions(roleId: string) {
    const rows = await queryToolPermissions(db, roleId);
    return resolveLoadedToolIds(normalizeToolPermissionIds(rows.map((row: any) => row.toolId)));
  }

  async function addRoleToolPermission(input: { roleId: string; toolId: string }) {
    try {
      await db
        .insert(roleToolPermissions)
        .values({
          roleId: input.roleId,
          toolId: input.toolId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .onConflictDoNothing();
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'addRoleToolPermission DB write failed',
        context: { roleId: input.roleId, toolId: input.toolId, error: errorMsg(err) },
      });
      throw err;
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
        .where(
          and(
            eq(roleToolPermissions.roleId, input.roleId),
            eq(roleToolPermissions.toolId, input.toolId),
          ),
        );
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'removeRoleToolPermission DB delete failed',
        context: { roleId: input.roleId, toolId: input.toolId, error: errorMsg(err) },
      });
      throw err;
    }

    return {
      roleId: input.roleId,
      toolId: input.toolId,
      success: true,
    };
  }

  async function listRoleWorkflowPermissions(roleId: string) {
    const rows = await queryWorkflowPermissions(db, roleId);
    return rows.map((row: any) => row.workflowId);
  }

  async function addRoleWorkflowPermission(input: { roleId: string; workflowId: string }) {
    try {
      await db
        .insert(roleWorkflowPermissions)
        .values({
          roleId: input.roleId,
          workflowId: input.workflowId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .onConflictDoNothing();
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'addRoleWorkflowPermission DB write failed',
        context: {
          roleId: input.roleId,
          workflowId: input.workflowId,
          error: errorMsg(err),
        },
      });
      throw err;
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
        .where(
          and(
            eq(roleWorkflowPermissions.roleId, input.roleId),
            eq(roleWorkflowPermissions.workflowId, input.workflowId),
          ),
        );
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'removeRoleWorkflowPermission DB delete failed',
        context: {
          roleId: input.roleId,
          workflowId: input.workflowId,
          error: errorMsg(err),
        },
      });
      throw err;
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

    return [...new Set([...toolIds, ...workflowIds])].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  async function listGrantedRoleCapabilitiesBatch(
    roleIds: string[],
  ): Promise<Map<string, string[]>> {
    if (roleIds.length === 0) return new Map();

    let toolRows: { roleId: string; toolId: string }[] = [];
    let workflowRows: { roleId: string; workflowId: string }[] = [];
    try {
      [toolRows, workflowRows] = await Promise.all([
        queryToolPermissionsBatch(db, roleIds),
        queryWorkflowPermissionsBatch(db, roleIds),
      ]);
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'listGrantedRoleCapabilitiesBatch DB read failed',
        context: { roleIdCount: roleIds.length, error: errorMsg(err) },
      });
      throw err;
    }

    const result = new Map<string, string[]>();
    for (const roleId of roleIds) {
      result.set(roleId, []);
    }

    for (const row of toolRows) {
      const existing = result.get(row.roleId) ?? [];
      existing.push(row.toolId);
      result.set(row.roleId, existing);
    }
    for (const row of workflowRows) {
      const existing = result.get(row.roleId) ?? [];
      existing.push(row.workflowId);
      result.set(row.roleId, existing);
    }

    for (const [roleId, ids] of result) {
      result.set(
        roleId,
        [...new Set(ids)].sort((a, b) => a.localeCompare(b)),
      );
    }

    return result;
  }

  async function listRoleCapabilities(roleId: string) {
    let grantedCapabilityIds: Set<string>;
    try {
      grantedCapabilityIds = new Set(await listGrantedRoleCapabilities(roleId));
    } catch (err) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'error',
        message: 'listRoleCapabilities: listGrantedRoleCapabilities failed',
        context: { roleId, error: errorMsg(err) },
      });
      throw err;
    }

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
      if (input.name == null || !input.name.trim()) {
        forgeDebug({
          scope: 'capabilities-store',
          level: 'warn',
          message: 'manageRole create: name required',
        });
        throw new Error('Role name is required.');
      }

      return await createRole({
        name: input.name.trim(),
        description:
          input.description != null && input.description.trim()
            ? input.description.trim()
            : undefined,
      });
    }

    if (input.action === 'delete') {
      if (input.roleId == null) {
        forgeDebug({
          scope: 'capabilities-store',
          level: 'warn',
          message: 'manageRole delete: roleId required',
        });
        throw new Error('roleId is required.');
      }

      return await deleteRole(input.roleId);
    }

    if (input.roleId == null) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'warn',
        message: 'manageRole update: roleId required',
      });
      throw new Error('roleId is required.');
    }

    if (input.name == null && input.description === undefined) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'warn',
        message: 'manageRole update: no fields provided',
      });
      throw new Error('At least one field besides roleId must be provided.');
    }

    return await updateRole({
      roleId: input.roleId,
      name: input.name?.trim(),
      description:
        input.description != null
          ? input.description.trim() || null
          : undefined,
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
        ? await addRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.capabilityId })
        : await addRoleToolPermission({ roleId: input.roleId, toolId: input.capabilityId });
    } else {
      return isWorkflow
        ? await removeRoleWorkflowPermission({
            roleId: input.roleId,
            workflowId: input.capabilityId,
          })
        : await removeRoleToolPermission({ roleId: input.roleId, toolId: input.capabilityId });
    }
  }

  async function getAgentCapabilities(agentId: string): Promise<CapabilitySet> {
    const agent = await queryAgent(db, agentId);

    if (agent == null) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'warn',
        message: 'assignRoleToAgent: agent not found',
        context: { agentId },
      });
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.roleId == null) {
      forgeDebug({
        scope: 'capabilities-store',
        level: 'warn',
        message: 'assignRoleToAgent: agent missing roleId',
        context: { agentId },
      });
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
    const rows = await queryAgents(db, {
      agentId: input.agentId ?? null,
      executionState: input.executionState,
    });

    return rows.map((row: any) => ({
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
    listGrantedRoleCapabilitiesBatch,
    listRoleCapabilities,
    manageRole,
    manageRoleCapability,
    getAgentCapabilities,
    listAgentStatuses,
  };
}