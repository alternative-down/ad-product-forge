import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCapabilityStore } from './store.js';

type MockDb = ReturnType<typeof makeMockDb>;
function makeMockDb() {
  return {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    query: {
      agents: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      agentRoles: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      roleToolPermissions: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      roleWorkflowPermissions: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  } as unknown as MockDb;
}

function setupRoleToolPermissions(mockDb: MockDb, toolIds: string[]) {
  mockDb.query.roleToolPermissions.findMany.mockResolvedValue(
    toolIds.map((toolId) => ({ roleId: 'role-1', toolId })),
  );
}

function setupRoleWorkflowPermissions(mockDb: MockDb, workflowIds: string[]) {
  mockDb.query.roleWorkflowPermissions.findMany.mockResolvedValue(
    workflowIds.map((workflowId) => ({ roleId: 'role-1', workflowId })),
  );
}

describe('createCapabilityStore', () => {
  let mockDb: MockDb;
  let store: ReturnType<typeof createCapabilityStore>;

  beforeEach(() => {
    mockDb = makeMockDb();
    store = createCapabilityStore(mockDb as any);
  });

  describe('listRoles', () => {
    it('returns empty array when no roles exist', async () => {
      mockDb.query.agentRoles.findMany.mockResolvedValue([]);
      const result = await store.listRoles();
      expect(result).toEqual([]);
    });

    it('returns roles sorted by name', async () => {
      mockDb.query.agentRoles.findMany.mockResolvedValue([
        { id: 'r1', name: 'Alpha Role', description: 'A test role', createdAt: 2000, updatedAt: 2000 },
        { id: 'r2', name: 'Zoe Role', description: null, createdAt: 1000, updatedAt: 1000 },
      ]);
      const result = await store.listRoles();
      expect(result).toEqual([
        { roleId: 'r1', name: 'Alpha Role', description: 'A test role', createdAt: 2000, updatedAt: 2000 },
        { roleId: 'r2', name: 'Zoe Role', description: undefined, createdAt: 1000, updatedAt: 1000 },
      ]);
    });
  });

  describe('getRole', () => {
    it('returns null when role not found', async () => {
      mockDb.query.agentRoles.findFirst.mockResolvedValue(null);
      const result = await store.getRole('nonexistent');
      expect(result).toBeNull();
    });

    it('returns role when found', async () => {
      mockDb.query.agentRoles.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'Admin',
        description: 'Administrator role',
        createdAt: 1000,
        updatedAt: 2000,
      });
      const result = await store.getRole('role-1');
      expect(result).toEqual({
        roleId: 'role-1',
        name: 'Admin',
        description: 'Administrator role',
        createdAt: 1000,
        updatedAt: 2000,
      });
    });
  });

  describe('createRole', () => {
    it('creates role and returns the record', async () => {
      const result = await store.createRole({ name: 'NewRole', description: 'A new role' });
      expect(result.roleId).toBeTruthy();
      expect(result.name).toBe('NewRole');
      expect(result.description).toBe('A new role');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('creates role without description', async () => {
      const result = await store.createRole({ name: 'MinimalRole' });
      expect(result.name).toBe('MinimalRole');
      expect(result.description).toBeUndefined();
    });
  });

  describe('updateRole', () => {
    it('throws when role not found', async () => {
      mockDb.query.agentRoles.findFirst.mockResolvedValue(null);
      await expect(store.updateRole({ roleId: 'missing', name: 'New Name' })).rejects.toThrow('Role not found');
    });

    it('updates name when provided', async () => {
      mockDb.query.agentRoles.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'Old Name',
        description: 'Desc',
        createdAt: 1000,
        updatedAt: 1000,
      });
      const result = await store.updateRole({ roleId: 'role-1', name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(result.description).toBe('Desc');
    });

    it('updates description when provided', async () => {
      mockDb.query.agentRoles.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'Name',
        description: null,
        createdAt: 1000,
        updatedAt: 1000,
      });
      const result = await store.updateRole({ roleId: 'role-1', description: 'New description' });
      expect(result.description).toBe('New description');
    });

    it('clears description when set to null', async () => {
      mockDb.query.agentRoles.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'Name',
        description: 'Old desc',
        createdAt: 1000,
        updatedAt: 1000,
      });
      const result = await store.updateRole({ roleId: 'role-1', description: null });
      expect(result.description).toBeUndefined();
    });
  });

  describe('deleteRole', () => {
    it('throws when role has assigned agents', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-1' });
      await expect(store.deleteRole('role-with-agents')).rejects.toThrow('Cannot delete role with assigned agents');
    });

    it('deletes role and returns success', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      const result = await store.deleteRole('standalone-role');
      expect(result).toEqual({ roleId: 'standalone-role', success: true });
      expect(mockDb.delete).toHaveBeenCalledTimes(3); // roleToolPermissions, roleWorkflowPermissions, agentRoles
    });
  });

  describe('listRoleToolPermissions', () => {
    it('returns empty when no tool permissions', async () => {
      mockDb.query.roleToolPermissions.findMany.mockResolvedValue([]);
      const result = await store.listRoleToolPermissions('role-1');
      expect(result).toEqual([]);
    });

    it('returns tool IDs sorted', async () => {
      mockDb.query.roleToolPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', toolId: 'zulu_tool' },
        { roleId: 'role-1', toolId: 'alpha_tool' },
      ]);
      const result = await store.listRoleToolPermissions('role-1');
      expect(result).toEqual(['alpha_tool', 'zulu_tool']);
    });

    it('adds list_agent_roles when role inspection tools are present', async () => {
      mockDb.query.roleToolPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', toolId: 'manage_agent_role' },
      ]);
      const result = await store.listRoleToolPermissions('role-1');
      expect(result).toContain('list_agent_roles');
    });

    it('adds list_role_capabilities when manage_role_capabilities is present', async () => {
      mockDb.query.roleToolPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', toolId: 'manage_role_capabilities' },
      ]);
      const result = await store.listRoleToolPermissions('role-1');
      expect(result).toContain('list_role_capabilities');
    });
  });

  describe('addRoleToolPermission', () => {
    it('inserts tool permission and returns roleId and toolId', async () => {
      const result = await store.addRoleToolPermission({ roleId: 'role-1', toolId: 'list_crons' });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'list_crons' });
    });
  });

  describe('removeRoleToolPermission', () => {
    it('deletes tool permission and returns success', async () => {
      const result = await store.removeRoleToolPermission({ roleId: 'role-1', toolId: 'list_crons' });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'list_crons', success: true });
    });
  });

  describe('listRoleWorkflowPermissions', () => {
    it('returns empty when no workflow permissions', async () => {
      mockDb.query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const result = await store.listRoleWorkflowPermissions('role-1');
      expect(result).toEqual([]);
    });

    it('returns workflow IDs sorted', async () => {
      mockDb.query.roleWorkflowPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', workflowId: 'wf-alpha', createdAt: 1000 },
        { roleId: 'role-1', workflowId: 'wf-beta', createdAt: 1000 },
      ]);
      const result = await store.listRoleWorkflowPermissions('role-1');
      expect(result).toEqual(['wf-alpha', 'wf-beta']);
    });
  });

  describe('addRoleWorkflowPermission', () => {
    it('inserts workflow permission and returns roleId and workflowId', async () => {
      const result = await store.addRoleWorkflowPermission({ roleId: 'role-1', workflowId: 'wf-123' });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-123' });
    });
  });

  describe('removeRoleWorkflowPermission', () => {
    it('deletes workflow permission and returns success', async () => {
      const result = await store.removeRoleWorkflowPermission({ roleId: 'role-1', workflowId: 'wf-123' });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-123', success: true });
    });
  });

  describe('listGrantedRoleCapabilities', () => {
    it('returns combined tool and workflow IDs sorted and deduplicated', async () => {
      setupRoleToolPermissions(mockDb, ['list_crons', 'manage_crons']);
      setupRoleWorkflowPermissions(mockDb, ['wf-alpha']);
      const result = await store.listGrantedRoleCapabilities('role-1');
      expect(result).toEqual(['list_crons', 'manage_crons', 'wf-alpha']);
    });
  });

  describe('listRoleCapabilities', () => {
    it('returns all capability IDs with granted flag', async () => {
      setupRoleToolPermissions(mockDb, ['list_contacts', 'upsert_contact']);
      setupRoleWorkflowPermissions(mockDb, []);
      const result = await store.listRoleCapabilities('role-1');
      const granted = result.filter((r) => r.granted).map((r) => r.capabilityId);
      expect(granted).toContain('list_contacts');
      expect(granted).toContain('upsert_contact');
      expect(result.length).toBeGreaterThan(2);
    });
  });

  describe('manageRole', () => {
    it('creates role when action is create', async () => {
      const result = await store.manageRole({ action: 'create', name: 'Managed Role', description: 'Desc' });
      expect(result.name).toBe('Managed Role');
      expect(result.description).toBe('Desc');
    });

    it('throws when creating role without name', async () => {
      await expect(store.manageRole({ action: 'create', name: '' })).rejects.toThrow('Role name is required');
    });

    it('throws when updating without roleId', async () => {
      await expect(store.manageRole({ action: 'update', name: 'New Name' })).rejects.toThrow('roleId is required');
    });

    it('deletes role when action is delete', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      const result = await store.manageRole({ action: 'delete', roleId: 'role-1' });
      expect(result).toEqual({ roleId: 'role-1', success: true });
    });
  });

  describe('manageRoleCapability', () => {
    it('adds tool permission when action is add', async () => {
      const result = await store.manageRoleCapability({ action: 'add', roleId: 'role-1', capabilityId: 'list_crons' });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'list_crons' });
    });

    it('removes tool permission when action is remove', async () => {
      const result = await store.manageRoleCapability({ action: 'remove', roleId: 'role-1', capabilityId: 'list_crons' });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'list_crons', success: true });
    });

    it('adds workflow permission when capabilityId starts with wf-', async () => {
      const result = await store.manageRoleCapability({ action: 'add', roleId: 'role-1', capabilityId: 'wf-abc' });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-abc' });
    });

    it('removes workflow permission when capabilityId starts with wf-', async () => {
      const result = await store.manageRoleCapability({ action: 'remove', roleId: 'role-1', capabilityId: 'wf-abc' });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-abc', success: true });
    });
  });

  describe('getAgentCapabilities', () => {
    it('throws when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      await expect(store.getAgentCapabilities('nonexistent')).rejects.toThrow('Agent not found');
    });

    it('throws when agent has no roleId', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-1', roleId: null });
      await expect(store.getAgentCapabilities('agent-1')).rejects.toThrow('Agent is missing roleId');
    });

    it('returns toolIds from agent role', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-1', roleId: 'role-1' });
      setupRoleToolPermissions(mockDb, ['list_contacts', 'send_message']);
      setupRoleWorkflowPermissions(mockDb, []);
      const result = await store.getAgentCapabilities('agent-1');
      expect(result.toolIds).toContain('list_contacts');
      expect(result.toolIds).toContain('send_message');
    });
  });

  describe('listAgentStatuses', () => {
    it('returns empty array when no agents', async () => {
      mockDb.query.agents.findMany.mockResolvedValue([]);
      const result = await store.listAgentStatuses();
      expect(result).toEqual([]);
    });

    it('returns agent statuses with role info', async () => {
      mockDb.query.agents.findMany.mockResolvedValue([
        {
          id: 'agent-1',
          name: 'Alpha',
          description: 'First agent',
          executionState: 'idle',
          updatedAt: 1000,
          role: { name: 'Admin', description: 'Admin role' },
        },
        {
          id: 'agent-2',
          name: 'Beta',
          description: null,
          executionState: 'running',
          updatedAt: 2000,
          role: { name: 'Worker', description: null },
        },
      ]);
      const result = await store.listAgentStatuses();
      expect(result).toEqual([
        {
          agentId: 'agent-1',
          name: 'Alpha',
          description: 'First agent',
          roleName: 'Admin',
          roleDescription: 'Admin role',
          executionState: 'idle',
          updatedAt: 1000,
        },
        {
          agentId: 'agent-2',
          name: 'Beta',
          description: undefined,
          roleName: 'Worker',
          roleDescription: undefined,
          executionState: 'running',
          updatedAt: 2000,
        },
      ]);
    });
  });
});