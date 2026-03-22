import { createId } from '@paralleldrive/cuid2';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import {
  agents,
  agentFunctions,
  agentRoles,
  functionRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { normalizeToolPermissionIds } from './catalog';

type CapabilitySet = {
  toolIds: string[];
  workflowIds: string[];
};

export function createCapabilityStore(db: Database) {
  async function listFunctions() {
    const rows = await db.query.agentFunctions.findMany({
      with: {
        roleLinks: {
          with: {
            role: true,
          },
        },
      },
      orderBy: [asc(agentFunctions.name)],
    });

    return rows.map(({ id, roleLinks, ...rest }) => ({
      ...rest,
      functionId: id,
      description: rest.description ?? undefined,
      roleIds: roleLinks.map((link) => link.roleId),
      roles: roleLinks
        .map((link) => link.role)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((role) => ({
          roleId: role.id,
          name: role.name,
          description: role.description ?? undefined,
        })),
    }));
  }

  async function createFunction(input: { name: string; description?: string }) {
    const now = Date.now();
    const record = {
      id: createId(),
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agentFunctions).values(record);

    return {
      functionId: record.id,
      name: record.name,
      description: input.description,
    };
  }

  async function getOrCreateFunction(input: { name: string; description?: string }) {
    const existing = await db.query.agentFunctions.findFirst({
      where: eq(agentFunctions.name, input.name),
    });

    if (existing) {
      return {
        functionId: existing.id,
        name: existing.name,
        description: existing.description ?? undefined,
      };
    }

    return createFunction(input);
  }

  async function updateFunction(input: { functionId: string; name?: string; description?: string | null }) {
    const existing = await db.query.agentFunctions.findFirst({
      where: eq(agentFunctions.id, input.functionId),
    });

    if (!existing) {
      throw new Error(`Function not found: ${input.functionId}`);
    }

    await db
      .update(agentFunctions)
      .set({
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        updatedAt: Date.now(),
      })
      .where(eq(agentFunctions.id, input.functionId));

    return {
      functionId: existing.id,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description ?? undefined : input.description ?? undefined,
    };
  }

  async function deleteFunction(functionId: string) {
    const assignedAgent = await db.query.agents.findFirst({
      where: eq(agents.functionId, functionId),
      columns: {
        id: true,
      },
    });

    if (assignedAgent) {
      throw new Error(`Cannot delete function with assigned agents: ${functionId}`);
    }

    await db.delete(functionRoles).where(eq(functionRoles.functionId, functionId));
    await db.delete(agentFunctions).where(eq(agentFunctions.id, functionId));

    return {
      functionId,
      success: true,
    };
  }

  async function listRoles() {
    const rows = await db.query.agentRoles.findMany({
      orderBy: [asc(agentRoles.name)],
    });

    return rows.map((row) => {
      const { id, ...rest } = row;

      return {
        ...rest,
        roleId: id,
        description: rest.description ?? undefined,
      };
    });
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
    const linkedFunctions = await db.query.functionRoles.findMany({
      where: eq(functionRoles.roleId, roleId),
      columns: {
        functionId: true,
      },
      limit: 1,
    });

    if (linkedFunctions.length > 0) {
      throw new Error(`Cannot delete role with assigned functions: ${roleId}`);
    }

    await db.delete(roleToolPermissions).where(eq(roleToolPermissions.roleId, roleId));
    await db.delete(roleWorkflowPermissions).where(eq(roleWorkflowPermissions.roleId, roleId));
    await db.delete(agentRoles).where(eq(agentRoles.id, roleId));

    return {
      roleId,
      success: true,
    };
  }

  async function addRoleToFunction(input: { functionId: string; roleId: string }) {
    await db
      .insert(functionRoles)
      .values({
        functionId: input.functionId,
        roleId: input.roleId,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({
        target: [functionRoles.functionId, functionRoles.roleId],
      });

    const link = await db.query.functionRoles.findFirst({
      where: and(eq(functionRoles.functionId, input.functionId), eq(functionRoles.roleId, input.roleId)),
      columns: {
        functionId: true,
        roleId: true,
      },
    });

    if (!link) {
      throw new Error(`Failed to persist function role relation: ${input.functionId} -> ${input.roleId}`);
    }

    return input;
  }

  async function ensureDefaultFunctionsForRoles() {
    const roles = await listRoles();

    for (const role of roles) {
      const existingFunction = await db.query.functionRoles.findFirst({
        where: eq(functionRoles.roleId, role.roleId),
        columns: {
          functionId: true,
        },
      });

      if (existingFunction) {
        continue;
      }

      const createdFunction = await createFunction({
        name: `Default ${role.name}`,
        description: `Default function for role ${role.name}.`,
      });

      await addRoleToFunction({
        functionId: createdFunction.functionId,
        roleId: role.roleId,
      });
    }
  }

  async function removeRoleFromFunction(input: { functionId: string; roleId: string }) {
    await db
      .delete(functionRoles)
      .where(and(eq(functionRoles.functionId, input.functionId), eq(functionRoles.roleId, input.roleId)));

    return input;
  }

  async function listRoleToolPermissions(roleId: string) {
    const rows = await db.query.roleToolPermissions.findMany({
      where: eq(roleToolPermissions.roleId, roleId),
      orderBy: [asc(roleToolPermissions.toolId)],
    });

    return normalizeToolPermissionIds(rows.map((row) => row.toolId));
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

  async function getAgentCapabilities(agentId: string): Promise<CapabilitySet> {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agent.functionId) {
      throw new Error(`Agent is missing functionId: ${agentId}`);
    }

    const functionRolesForAgent = await db.query.functionRoles.findMany({
      where: eq(functionRoles.functionId, agent.functionId),
    });

    if (functionRolesForAgent.length === 0) {
      return {
        toolIds: [],
        workflowIds: [],
      };
    }

    const capabilitySets = await Promise.all(
      functionRolesForAgent.map(async (functionRole) => ({
        toolIds: await listRoleToolPermissions(functionRole.roleId),
        workflowIds: await listRoleWorkflowPermissions(functionRole.roleId),
      })),
    );

    return {
      toolIds: [...new Set(capabilitySets.flatMap((set) => set.toolIds))].sort(),
      workflowIds: [...new Set(capabilitySets.flatMap((set) => set.workflowIds))].sort(),
    };
  }

  return {
    listFunctions,
    createFunction,
    getOrCreateFunction,
    updateFunction,
    deleteFunction,
    listRoles,
    createRole,
    updateRole,
    deleteRole,
    addRoleToFunction,
    ensureDefaultFunctionsForRoles,
    removeRoleFromFunction,
    listRoleToolPermissions,
    addRoleToolPermission,
    removeRoleToolPermission,
    listRoleWorkflowPermissions,
    addRoleWorkflowPermission,
    removeRoleWorkflowPermission,
    getAgentCapabilities,
  };
}
