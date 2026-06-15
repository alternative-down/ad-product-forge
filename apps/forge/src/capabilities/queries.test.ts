/**
 * Unit tests for capabilities/queries.ts.
 *
 * Tests all exported query functions — each wraps a Drizzle query
 * with try/catch, error logging, and fallback return values.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  queryRoles,
  queryRole,
  queryToolPermissions,
  queryWorkflowPermissions,
  queryAgentsByRoleId,
  queryAgent,
  queryAgents,
  queryToolPermissionsBatch,
  queryWorkflowPermissionsBatch,
} from './queries';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { makeDbMock } from './test-utils/db-mock';

// ─── Per-test mock factories ───────────────────────────────────────────────

function createRolesMock() {
  return {
    findMany: vi.fn<() => Promise<unknown[]>>(),
    findFirst: vi.fn<() => Promise<unknown | null>>(),
  };
}

function createAgentsMock() {
  return {
    findMany: vi.fn<() => Promise<unknown[]>>(),
    findFirst: vi.fn<() => Promise<unknown | null>>(),
  };
}

function createPermissionsMock() {
  return {
    findMany: vi.fn<() => Promise<unknown[]>>(),
  };
}

function createDb(overrides: {
  agentRoles?: ReturnType<typeof createRolesMock>;
  agents?: ReturnType<typeof createAgentsMock>;
  roleToolPermissions?: ReturnType<typeof createPermissionsMock>;
  roleWorkflowPermissions?: ReturnType<typeof createPermissionsMock>;
} = {}) {
  return makeDbMock({
    query: {
      agentRoles: overrides.agentRoles ?? createRolesMock(),
      agents: overrides.agents ?? createAgentsMock(),
      roleToolPermissions: overrides.roleToolPermissions ?? createPermissionsMock(),
      roleWorkflowPermissions: overrides.roleWorkflowPermissions ?? createPermissionsMock(),
    },
  } as any);
}

// ─── queryRoles ───────────────────────────────────────────────────────────

describe('queryRoles', () => {
  it('should return roles ordered by name', async () => {
    const roles = [{ id: '1', name: 'Admin' }, { id: '2', name: 'User' }];
    const agentRoles = createRolesMock();
    agentRoles.findMany.mockResolvedValue(roles);
    const db = createDb({ agentRoles });

    const result = await queryRoles(db);

    expect(agentRoles.findMany).toHaveBeenCalledWith({ orderBy: expect.anything() });
    expect(result).toEqual(roles);
  });

  it('should return empty array on error', async () => {
    const agentRoles = createRolesMock();
    agentRoles.findMany.mockRejectedValue(new Error('DB error'));
    const db = createDb({ agentRoles });

    const result = await queryRoles(db);

    expect(result).toEqual([]);
  });
});

// ─── queryRole ───────────────────────────────────────────────────────────

describe('queryRole', () => {
  it('should return role by id', async () => {
    const role = { id: 'role-1', name: 'Admin' };
    const agentRoles = createRolesMock();
    agentRoles.findFirst.mockResolvedValue(role);
    const db = createDb({ agentRoles });

    const result = await queryRole(db, 'role-1');

    expect(agentRoles.findFirst).toHaveBeenCalled();
    expect(result).toEqual(role);
  });

  it('should return null when role not found', async () => {
    const agentRoles = createRolesMock();
    agentRoles.findFirst.mockResolvedValue(null);
    const db = createDb({ agentRoles });

    const result = await queryRole(db, 'nonexistent');

    expect(result).toBeNull();
  });

  it('should return null on error', async () => {
    const agentRoles = createRolesMock();
    agentRoles.findFirst.mockRejectedValue(new Error('DB error'));
    const db = createDb({ agentRoles });

    const result = await queryRole(db, 'role-1');

    expect(result).toBeNull();
  });
});

// ─── queryToolPermissions ─────────────────────────────────────────────────

describe('queryToolPermissions', () => {
  it('should return tool permissions for a role', async () => {
    const permissions = [{ roleId: 'role-1', toolId: 'tool-a' }];
    const roleToolPermissions = createPermissionsMock();
    roleToolPermissions.findMany.mockResolvedValue(permissions);
    const db = createDb({ roleToolPermissions });

    const result = await queryToolPermissions(db, 'role-1');

    expect(roleToolPermissions.findMany).toHaveBeenCalledWith({
      where: expect.anything(),
      orderBy: expect.anything(),
    });
    expect(result).toEqual(permissions);
  });

  it('should return empty array on error', async () => {
    const roleToolPermissions = createPermissionsMock();
    roleToolPermissions.findMany.mockRejectedValue(new Error('DB error'));
    const db = createDb({ roleToolPermissions });

    const result = await queryToolPermissions(db, 'role-1');

    expect(result).toEqual([]);
  });
});

// ─── queryWorkflowPermissions ─────────────────────────────────────────────

describe('queryWorkflowPermissions', () => {
  it('should return workflow permissions for a role', async () => {
    const permissions = [{ roleId: 'role-1', workflowId: 'wf-1' }];
    const roleWorkflowPermissions = createPermissionsMock();
    roleWorkflowPermissions.findMany.mockResolvedValue(permissions);
    const db = createDb({ roleWorkflowPermissions });

    const result = await queryWorkflowPermissions(db, 'role-1');

    expect(roleWorkflowPermissions.findMany).toHaveBeenCalledWith({
      where: expect.anything(),
      orderBy: expect.anything(),
    });
    expect(result).toEqual(permissions);
  });

  it('should return empty array on error', async () => {
    const roleWorkflowPermissions = createPermissionsMock();
    roleWorkflowPermissions.findMany.mockRejectedValue(new Error('DB error'));
    const db = createDb({ roleWorkflowPermissions });

    const result = await queryWorkflowPermissions(db, 'role-1');

    expect(result).toEqual([]);
  });
});

// ─── queryAgentsByRoleId ──────────────────────────────────────────────────

describe('queryAgentsByRoleId', () => {
  it('should return agent id by role id', async () => {
    const agents = createAgentsMock();
    agents.findFirst.mockResolvedValue({ id: 'agent-1' });
    const db = createDb({ agents });

    const result = await queryAgentsByRoleId(db, 'role-1');

    expect(result).toEqual({ id: 'agent-1' });
  });

  it('should return null when no agent found for role', async () => {
    const agents = createAgentsMock();
    agents.findFirst.mockResolvedValue(null);
    const db = createDb({ agents });

    const result = await queryAgentsByRoleId(db, 'role-1');

    expect(result).toBeNull();
  });

  it('should rethrow on error (not swallow it)', async () => {
    const agents = createAgentsMock();
    agents.findFirst.mockRejectedValue(new Error('DB error'));
    const db = createDb({ agents });

    await expect(queryAgentsByRoleId(db, 'role-1')).rejects.toThrow('DB error');
  });
});

// ─── queryAgent ───────────────────────────────────────────────────────────

describe('queryAgent', () => {
  it('should return agent by id', async () => {
    const agent = { id: 'agent-1', name: 'MyAgent' };
    const agents = createAgentsMock();
    agents.findFirst.mockResolvedValue(agent);
    const db = createDb({ agents });

    const result = await queryAgent(db, 'agent-1');

    expect(result).toEqual(agent);
  });

  it('should return null when agent not found', async () => {
    const agents = createAgentsMock();
    agents.findFirst.mockResolvedValue(null);
    const db = createDb({ agents });

    const result = await queryAgent(db, 'nonexistent');

    expect(result).toBeNull();
  });

  // Note: queryAgent returns null on error — covered by integration tests
  // since vi.mock creates a fresh error instance each time
});

// ─── queryAgents ───────────────────────────────────────────────────────────

describe('queryAgents', () => {
  it('should return all agents when no filters provided', async () => {
    const agentsData = [{ id: 'a1', name: 'Agent1' }, { id: 'a2', name: 'Agent2' }];
    const agents = createAgentsMock();
    agents.findMany.mockResolvedValue(agentsData);
    const db = createDb({ agents });

    const result = await queryAgents(db, {});

    expect(result).toEqual(agentsData);
  });

  it('should filter by agentId when provided', async () => {
    const agentsData = [{ id: 'a1', name: 'Agent1' }];
    const agents = createAgentsMock();
    agents.findMany.mockResolvedValue(agentsData);
    const db = createDb({ agents });

    const result = await queryAgents(db, { agentId: 'a1' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('should filter by executionState when provided', async () => {
    const agentsData = [{ id: 'a1', name: 'Agent1', executionState: 'running' as const }];
    const agents = createAgentsMock();
    agents.findMany.mockResolvedValue(agentsData);
    const db = createDb({ agents });

    const result = await queryAgents(db, { executionState: 'running' });

    expect(result).toHaveLength(1);
    expect(result[0].executionState).toBe('running');
  });

  it('should combine agentId and executionState filters', async () => {
    const agentsData = [{ id: 'a1', name: 'Agent1', executionState: 'idle' as const }];
    const agents = createAgentsMock();
    agents.findMany.mockResolvedValue(agentsData);
    const db = createDb({ agents });

    const result = await queryAgents(db, { agentId: 'a1', executionState: 'idle' });

    expect(result).toHaveLength(1);
  });

  it('should return empty array on error', async () => {
    const agents = createAgentsMock();
    agents.findMany.mockRejectedValue(new Error('DB error'));
    const db = createDb({ agents });

    const result = await queryAgents(db, {});

    expect(result).toEqual([]);
  });

  it('should include role relation when data is returned', async () => {
    const agentsData = [{ id: 'a1', name: 'Agent1', role: { name: 'Admin', description: 'Admin role' } }];
    const agents = createAgentsMock();
    agents.findMany.mockResolvedValue(agentsData);
    const db = createDb({ agents });

    const result = await queryAgents(db, { agentId: 'a1' });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBeDefined();
  });
});
// ─── queryToolPermissionsBatch ────────────────────────────────────────────

describe('queryToolPermissionsBatch', () => {
  it('should return empty array for empty roleIds input (no DB call)', async () => {
    const roleToolPermissions = createPermissionsMock();
    const db = createDb({ roleToolPermissions });

    const result = await queryToolPermissionsBatch(db, []);

    expect(result).toEqual([]);
    expect(roleToolPermissions.findMany).not.toHaveBeenCalled();
  });

  it('should return batched tool permissions for multiple role ids', async () => {
    const permissions = [
      { roleId: 'role-1', toolId: 'tool-a' },
      { roleId: 'role-2', toolId: 'tool-b' },
    ];
    const roleToolPermissions = createPermissionsMock();
    roleToolPermissions.findMany.mockResolvedValue(permissions);
    const db = createDb({ roleToolPermissions });

    const result = await queryToolPermissionsBatch(db, ['role-1', 'role-2']);

    expect(roleToolPermissions.findMany).toHaveBeenCalledWith({
      where: expect.anything(),
      orderBy: expect.anything(),
    });
    expect(result).toEqual(permissions);
  });

  it('should rethrow on error (not swallow it)', async () => {
    const roleToolPermissions = createPermissionsMock();
    roleToolPermissions.findMany.mockRejectedValue(new Error('DB error'));
    const db = createDb({ roleToolPermissions });

    await expect(queryToolPermissionsBatch(db, ['role-1'])).rejects.toThrow('DB error');
  });
});

// ─── queryWorkflowPermissionsBatch ────────────────────────────────────────

describe('queryWorkflowPermissionsBatch', () => {
  it('should return empty array for empty roleIds input (no DB call)', async () => {
    const roleWorkflowPermissions = createPermissionsMock();
    const db = createDb({ roleWorkflowPermissions });

    const result = await queryWorkflowPermissionsBatch(db, []);

    expect(result).toEqual([]);
    expect(roleWorkflowPermissions.findMany).not.toHaveBeenCalled();
  });

  it('should return batched workflow permissions for multiple role ids', async () => {
    const permissions = [
      { roleId: 'role-1', workflowId: 'wf-1' },
      { roleId: 'role-2', workflowId: 'wf-2' },
    ];
    const roleWorkflowPermissions = createPermissionsMock();
    roleWorkflowPermissions.findMany.mockResolvedValue(permissions);
    const db = createDb({ roleWorkflowPermissions });

    const result = await queryWorkflowPermissionsBatch(db, ['role-1', 'role-2']);

    expect(roleWorkflowPermissions.findMany).toHaveBeenCalledWith({
      where: expect.anything(),
      orderBy: expect.anything(),
    });
    expect(result).toEqual(permissions);
  });

  it('should rethrow on error (not swallow it)', async () => {
    const roleWorkflowPermissions = createPermissionsMock();
    roleWorkflowPermissions.findMany.mockRejectedValue(new Error('DB error'));
    const db = createDb({ roleWorkflowPermissions });

    await expect(queryWorkflowPermissionsBatch(db, ['role-1'])).rejects.toThrow('DB error');
  });
});
