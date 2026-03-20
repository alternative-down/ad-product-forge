import { createId } from '@paralleldrive/cuid2';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import {
  agents,
  agentFunctions,
  agentRoles,
  functionRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema.js';

type CapabilitySet = {
  toolIds: string[];
  workflowIds: string[];
};

export function createCapabilityStore(db: Database) {
  async function listFunctions() {
    const rows = await db.query.agentFunctions.findMany({
      with: {
        roleLink: true,
      },
      orderBy: [asc(agentFunctions.name)],
    });

    return rows.map((row) => ({
      functionId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      roleId: row.roleLink?.roleId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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

  async function assignRoleToFunction(input: { functionId: string; roleId: string }) {
    const now = Date.now();

    await db
      .insert(functionRoles)
      .values({
        functionId: input.functionId,
        roleId: input.roleId,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: functionRoles.functionId,
        set: {
          roleId: input.roleId,
          createdAt: now,
        },
      });

    return {
      functionId: input.functionId,
      roleId: input.roleId,
    };
  }

  async function assignFunctionToAgent(input: { agentId: string; functionId: string | null }) {
    const existing = await db.query.agents.findFirst({
      where: eq(agents.id, input.agentId),
    });

    if (!existing) {
      throw new Error(`Agent not found: ${input.agentId}`);
    }

    await db
      .update(agents)
      .set({
        functionId: input.functionId,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, input.agentId));

    return {
      agentId: input.agentId,
      functionId: input.functionId,
    };
  }

  async function listRoleToolPermissions(roleId: string) {
    const rows = await db.query.roleToolPermissions.findMany({
      where: eq(roleToolPermissions.roleId, roleId),
      orderBy: [asc(roleToolPermissions.toolId)],
    });

    return rows.map((row) => row.toolId);
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

  async function getAgentCapabilities(agentId: string): Promise<CapabilitySet | null> {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent?.functionId) {
      return null;
    }

    const functionRole = await db.query.functionRoles.findFirst({
      where: eq(functionRoles.functionId, agent.functionId),
    });

    if (!functionRole) {
      return {
        toolIds: [],
        workflowIds: [],
      };
    }

    const [toolIds, workflowIds] = await Promise.all([
      listRoleToolPermissions(functionRole.roleId),
      listRoleWorkflowPermissions(functionRole.roleId),
    ]);

    return {
      toolIds,
      workflowIds,
    };
  }

  return {
    listFunctions,
    createFunction,
    updateFunction,
    listRoles,
    createRole,
    updateRole,
    assignRoleToFunction,
    assignFunctionToAgent,
    listRoleToolPermissions,
    addRoleToolPermission,
    removeRoleToolPermission,
    listRoleWorkflowPermissions,
    addRoleWorkflowPermission,
    removeRoleWorkflowPermission,
    getAgentCapabilities,
  };
}
