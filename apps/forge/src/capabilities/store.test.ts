import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../database/index';
import {
  agents,
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from '../database/schema';
import { createCapabilityStore } from './store';

// ── Mock helpers ─────────────────────────────────────────────────────────────
function createMockAgent(overrides = {}) {
  return {
    id: 'agent-test',
    name: 'Test Agent',
    description: null,
    roleId: null,
    modelProfileId: 'mp-1',
    omModelProfileId: 'omp-1',
    instructions: 'Be helpful.',
    executionState: 'idle',
    lastExecutionError: null,
    lastExecutionErrorAt: null,
    workspaceAutoSync: 1,
    workspaceBm25: 1,
    workspaceEmbedder: 'transformers-multilingual-e5-small-cpu',
    workspaceFilesystem: null,
    workspaceSandbox: null,
    workspaceSkills: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}
function createMockRole(overrides = {}) {
  return {
    id: 'role-test',
    name: 'Test Role',
    description: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}
function createMockDb() {
  const makeInsertChain = () => {
    const chain = {};
    const fn = vi.fn().mockImplementation((_table) => {
      chain.values = vi.fn().mockImplementation((_vals) => {
        chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
        return chain;
      });
      chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
      return chain;
    });
    fn.values = vi.fn().mockImplementation((_vals) => {
      chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
      return chain;
    });
    fn.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    return fn;
  };
  const makeDeleteChain = () => {
    const whereChain = { where: vi.fn<any>().mockResolvedValue(undefined) };
    const fn = vi.fn<any>().mockImplementation((_table: any) => whereChain);
    fn.mockImplementation((_table: any) => whereChain);
    return fn as any;
  };
  const makeUpdateChain = () => {
    const whereChain = { returning: vi.fn<any>().mockResolvedValue(undefined) };
    const setChain = { where: vi.fn<any>().mockImplementation(() => whereChain) };
    const chain = { set: vi.fn<any>().mockImplementation(() => setChain) };
    const fn = vi.fn<any>().mockImplementation((_table: any) => chain);
    fn.mockImplementation((_table: any) => chain);
    return fn as any;
  };
  const query = {
    agentRoles: { findMany: vi.fn(), findFirst: vi.fn() },
    roleToolPermissions: { findMany: vi.fn() },
    roleWorkflowPermissions: { findMany: vi.fn() },
    agents: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  const db = {
    insert: makeInsertChain(),
    update: makeUpdateChain(),
    delete: makeDeleteChain(),
    query,
  };
  return { db, query };
}

// ── resolveLoadedToolIds (mirrors store.ts private helper) ───────────────────
const ROLE_INSPECTION_TOOL_IDS = [
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
];
function resolveLoadedToolIds(toolIds) {
  const resolved = new Set(toolIds);
  const hasCrossAgentCron = resolved.has('manage_crons') || resolved.has('list_crons');
  const hasCrossAgentRole = resolved.has('change_agent_role');
  const hasRoleInspection = ROLE_INSPECTION_TOOL_IDS.some((id) => resolved.has(id));
  if (hasRoleInspection) resolved.add('list_agent_roles');
  if (resolved.has('manage_role_capabilities')) resolved.add('list_role_capabilities');
  if (!hasCrossAgentCron && !hasCrossAgentRole) {
    return [...resolved].sort((a, b) => a.localeCompare(b));
  }
  return [...resolved]
    .filter((id) => {
      if (hasCrossAgentCron && (id === 'manage_self_crons' || id === 'list_self_crons'))
        return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('resolveLoadedToolIds', () => {
  it('returns sorted toolIds when no cross-agent tools present', () => {
    expect(resolveLoadedToolIds(['list_agents', 'send_message'])).toEqual(['list_agents', 'send_message']);
  });
  it('returns sorted toolIds when no special tools at all', () => {
    expect(resolveLoadedToolIds(['get_weather'])).toEqual(['get_weather']);
  });
  it('adds list_agent_roles when has role inspection tool', () => {
    expect(resolveLoadedToolIds(['manage_agent_role'])).toContain('list_agent_roles');
  });
  it('adds list_role_capabilities when manage_role_capabilities is present', () => {
    const result = resolveLoadedToolIds(['manage_role_capabilities']);
    expect(result).toContain('list_role_capabilities');
    expect(result).toContain('manage_role_capabilities');
  });
  it('removes *_self_crons when cross-agent cron tools present', () => {
    const result = resolveLoadedToolIds(['manage_crons', 'list_crons', 'manage_self_crons', 'list_self_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).not.toContain('list_self_crons');
    expect(result).toContain('manage_crons');
    expect(result).toContain('list_crons');
  });
  it('removes manage_self_crons when only list_crons is present', () => {
    const result = resolveLoadedToolIds(['list_crons', 'manage_self_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).toContain('list_crons');
  });
  it('does not filter by cross-agent role tool alone (no cron tools)', () => {
    const result = resolveLoadedToolIds(['change_agent_role', 'manage_self_crons']);
    expect(result).toContain('change_agent_role');
    expect(result).toContain('manage_self_crons');
    expect(result).toContain('list_agent_roles');
  });
  it('result is always sorted alphabetically', () => {
    const result = resolveLoadedToolIds(['zebra', 'apple', 'manage_crons']);
    expect(result).toEqual(['apple', 'manage_crons', 'zebra']);
  });
  it('handles empty array', () => {
    expect(resolveLoadedToolIds([])).toEqual([]);
  });
  it('handles no cross-agent tools and no role inspection tools', () => {
    expect(resolveLoadedToolIds(['get_weather', 'send_message', 'list_agents'])).toEqual(['get_weather', 'list_agents', 'send_message']);
  });
});

describe('capabilities/store', () => {
  // ── listRoles ─────────────────────────────────────────────────────────────
  describe('listRoles', () => {
    it('returns roles sorted by name asc', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findMany.mockResolvedValue([
        createMockRole({ id: 'r-1', name: 'Alpha Role' }),
        createMockRole({ id: 'r-2', name: 'Zeta Role' })
      ]);
      const store = createCapabilityStore(db);
      const result = await store.listRoles();
      expect(result[0].name).toBe('Alpha Role');
      expect(result[1].name).toBe('Zeta Role');
    });
    it('maps description null to undefined', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findMany.mockResolvedValue([createMockRole({ description: null })]);
      const store = createCapabilityStore(db);
      const result = await store.listRoles();
      expect(result[0].description).toBeUndefined();
    });
    it('preserves description when present', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findMany.mockResolvedValue([createMockRole({ description: 'Admin role' })]);
      const store = createCapabilityStore(db);
      const result = await store.listRoles();
      expect(result[0].description).toBe('Admin role');
    });
    it('maps all role fields correctly', async () => {
      const { db, query } = createMockDb();
      const ts = 1700000000000;
      query.agentRoles.findMany.mockResolvedValue([createMockRole({ createdAt: ts, updatedAt: ts + 100 })]);
      const store = createCapabilityStore(db);
      const result = await store.listRoles();
      expect(result[0]).toMatchObject({ roleId: 'role-test', name: 'Test Role', createdAt: ts, updatedAt: ts + 100 });
    });
  });

  // ── getRole ───────────────────────────────────────────────────────────────
  describe('getRole', () => {
    it('returns null when role not found', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(null);
      const store = createCapabilityStore(db);
      const result = await store.getRole('non-existent');
      expect(result).toBeNull();
    });
    it('returns role when found', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ name: 'Admin', description: 'The admin role' }));
      const store = createCapabilityStore(db);
      const result = await store.getRole('role-test');
      expect(result).toMatchObject({ roleId: 'role-test', name: 'Admin', description: 'The admin role' });
    });
  });

  // ── createRole ────────────────────────────────────────────────────────────
  describe('createRole', () => {
    it('creates role with name and description', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.createRole({ name: 'New Role', description: 'A test role' });
      expect(result).toMatchObject({ name: 'New Role', description: 'A test role' });
      expect(result.roleId).toBeDefined();
    });
    it('creates role without description', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.createRole({ name: 'Minimal Role' });
      expect(result.name).toBe('Minimal Role');
      expect(result.description).toBeUndefined();
    });
    it('grants base tool permissions', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      await store.createRole({ name: 'Base Role' });
      const insertCalls = db.insert.mock.calls;
      const toolPermCalls = insertCalls.filter(([table]) => table === roleToolPermissions);
      expect(toolPermCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── updateRole ────────────────────────────────────────────────────────────
  describe('updateRole', () => {
    it('throws when role not found', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(null);
      const store = createCapabilityStore(db);
      await expect(store.updateRole({ roleId: 'non-existent', name: 'New Name' })).rejects.toThrow('Role not found');
    });
    it('updates name', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ name: 'Old Name' }));
      const store = createCapabilityStore(db);
      const result = await store.updateRole({ roleId: 'role-test', name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(db.update).toHaveBeenCalled();
    });
    it('updates description to a string', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ description: null }));
      const store = createCapabilityStore(db);
      const result = await store.updateRole({ roleId: 'role-test', description: 'New Description' });
      expect(result.description).toBe('New Description');
    });
    it('updates description to null -> undefined', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ description: 'Old desc' }));
      const store = createCapabilityStore(db);
      const result = await store.updateRole({ roleId: 'role-test', description: null });
      expect(result.description).toBeUndefined();
    });
    it('preserves existing fields when not provided', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ name: 'Keep', description: 'Keep Desc' }));
      const store = createCapabilityStore(db);
      const result = await store.updateRole({ roleId: 'role-test', name: 'New' });
      expect(result.name).toBe('New');
      expect(result.description).toBe('Keep Desc');
    });
  });

  // ── deleteRole ────────────────────────────────────────────────────────────
  describe('deleteRole', () => {
    it('throws when agents are assigned to the role', async () => {
      const { db, query } = createMockDb();
      query.agents.findFirst.mockResolvedValue(createMockAgent({ roleId: 'role-test' }));
      const store = createCapabilityStore(db);
      await expect(store.deleteRole('role-test')).rejects.toThrow('Cannot delete role with assigned agents');
    });
    it('deletes role when no agents assigned', async () => {
      const { db, query } = createMockDb();
      query.agents.findFirst.mockResolvedValue(null);
      const store = createCapabilityStore(db);
      const result = await store.deleteRole('role-test');
      expect(result).toEqual({ roleId: 'role-test', success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ── listRoleToolPermissions ────────────────────────────────────────────────
  describe('listRoleToolPermissions', () => {
    it('returns empty array when no permissions', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      expect(await store.listRoleToolPermissions('role-test')).toEqual([]);
    });
    it('resolves and sorts tool IDs from permission rows', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([
        { roleId: 'role-test', toolId: 'send_message', createdAt: 1000 },
        { roleId: 'role-test', toolId: 'list_agents', createdAt: 1000 }
      ]);
      const store = createCapabilityStore(db);
      expect(await store.listRoleToolPermissions('role-test')).toEqual(['list_agents', 'send_message']);
    });
    it('queries with roleId filter', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      await store.listRoleToolPermissions('role-xyz');
      expect(query.roleToolPermissions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
    });
  });

  // ── addRoleToolPermission ─────────────────────────────────────────────────
  describe('addRoleToolPermission', () => {
    it('inserts permission into roleToolPermissions', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.addRoleToolPermission({ roleId: 'role-1', toolId: 'send_message' });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'send_message' });
      expect(db.insert).toHaveBeenCalledWith(roleToolPermissions);
    });
  });

  // ── removeRoleToolPermission ───────────────────────────────────────────────
  describe('removeRoleToolPermission', () => {
    it('deletes permission and returns success', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.removeRoleToolPermission({ roleId: 'role-1', toolId: 'send_message' });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'send_message', success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ── listRoleWorkflowPermissions ──────────────────────────────────────────
  describe('listRoleWorkflowPermissions', () => {
    it('returns workflow ids sorted asc', async () => {
      const { db, query } = createMockDb();
      query.roleWorkflowPermissions.findMany.mockResolvedValue([
        { workflowId: 'wf-alpha', roleId: 'role-1', createdAt: 0 },
        { workflowId: 'wf-beta', roleId: 'role-1', createdAt: 0 },
      ]);
      const store = createCapabilityStore(db);
      expect(await store.listRoleWorkflowPermissions('role-1')).toEqual(['wf-alpha', 'wf-beta']);
    });
    it('returns empty array when no permissions', async () => {
      const { db, query } = createMockDb();
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      expect(await store.listRoleWorkflowPermissions('role-1')).toEqual([]);
    });
    it('queries with roleId filter', async () => {
      const { db, query } = createMockDb();
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      await store.listRoleWorkflowPermissions('role-xyz');
      expect(query.roleWorkflowPermissions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
    });
  });

  // ── addRoleWorkflowPermission ─────────────────────────────────────────────
  describe('addRoleWorkflowPermission', () => {
    it('inserts workflow permission', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.addRoleWorkflowPermission({ roleId: 'role-1', workflowId: 'wf-1' });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-1' });
      expect(db.insert).toHaveBeenCalledWith(roleWorkflowPermissions);
    });
  });

  // ── removeRoleWorkflowPermission ──────────────────────────────────────────
  describe('removeRoleWorkflowPermission', () => {
    it('deletes workflow permission and returns success', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.removeRoleWorkflowPermission({ roleId: 'role-1', workflowId: 'wf-1' });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-1', success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ── listGrantedRoleCapabilities ──────────────────────────────────────────
  describe('listGrantedRoleCapabilities', () => {
    it('returns combined tool and workflow ids, deduplicated, sorted', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', toolId: 'send_message', createdAt: 0 },
        { roleId: 'role-1', toolId: 'list_agents', createdAt: 0 }
      ]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', workflowId: 'wf-alpha', createdAt: 0 },
        { roleId: 'role-1', workflowId: 'wf-beta', createdAt: 0 }
      ]);
      const store = createCapabilityStore(db);
      expect(await store.listGrantedRoleCapabilities('role-1')).toEqual([
        'list_agents',
        'send_message',
        'wf-alpha',
        'wf-beta'
      ]);
    });
    it('returns empty array when no permissions at all', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      expect(await store.listGrantedRoleCapabilities('role-1')).toEqual([]);
    });
  });

  // ── listRoleCapabilities ──────────────────────────────────────────────────
  describe('listRoleCapabilities', () => {
    it('returns all capability ids with granted=false when no permissions', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.listRoleCapabilities('role-1');
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((item) => item.granted === false)).toBe(true);
    });
    it('marks granted=true for capabilities the role has', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', toolId: 'send_message', createdAt: 0 }
      ]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.listRoleCapabilities('role-1');
      const sendMsgItem = result.find((item) => item.capabilityId === 'send_message');
      expect(sendMsgItem?.granted).toBe(true);
    });
    it('returns capabilities sorted by capabilityId', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.listRoleCapabilities('role-1');
      const ids = result.map((item) => item.capabilityId);
      const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sortedIds);
    });
  });

  // ── manageRole ────────────────────────────────────────────────────────────
  describe('manageRole', () => {
    it('create: throws when name is missing', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      await expect(store.manageRole({ action: 'create', name: '' })).rejects.toThrow('Role name is required.');
    });
    it('create: throws when name is only whitespace', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      await expect(store.manageRole({ action: 'create', name: '   ' })).rejects.toThrow('Role name is required.');
    });
    it('create: trims name and description', async () => {
      const { db, query } = createMockDb();
      query.roleToolPermissions.findMany.mockResolvedValue([]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.manageRole({ action: 'create', name: '  Trimmed Name  ', description: '  Desc  ' });
      expect(result.name).toBe('Trimmed Name');
      expect(result.description).toBe('Desc');
    });
    it('update: throws when roleId is missing', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      await expect(store.manageRole({ action: 'update', name: 'New Name' })).rejects.toThrow('roleId is required.');
    });
    it('update: throws when neither name nor description provided', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(null);
      const store = createCapabilityStore(db);
      await expect(store.manageRole({ action: 'update', roleId: 'role-test' })).rejects.toThrow(
        'At least one field besides roleId must be provided.',
      );
    });
    it('update: trims name and description and passes to updateRole', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ name: 'Old' }));
      const store = createCapabilityStore(db);
      const result = await store.manageRole({ action: 'update', roleId: 'role-test', name: '  New Name  ', description: '  New Desc  ' });
      expect(result.name).toBe('New Name');
      expect(result.description).toBe('New Desc');
    });
    it('update: treats empty/blank description string as null', async () => {
      const { db, query } = createMockDb();
      query.agentRoles.findFirst.mockResolvedValue(createMockRole({ name: 'Old' }));
      const store = createCapabilityStore(db);
      const result = await store.manageRole({ action: 'update', roleId: 'role-test', name: 'New', description: '   ' });
      expect(result.description).toBeUndefined();
    });
    it('delete: throws when roleId is missing', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      await expect(store.manageRole({ action: 'delete' })).rejects.toThrow('roleId is required.');
    });
    it('delete: delegates to deleteRole', async () => {
      const { db, query } = createMockDb();
      query.agents.findFirst.mockResolvedValue(null);
      const store = createCapabilityStore(db);
      const result = await store.manageRole({ action: 'delete', roleId: 'role-to-delete' });
      expect(result).toEqual({ roleId: 'role-to-delete', success: true });
    });
  });

  // ── manageRoleCapability ──────────────────────────────────────────────────
  describe('manageRoleCapability', () => {
    it('grant tool: calls addRoleToolPermission', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.manageRoleCapability({ action: 'add', roleId: 'role-1', capabilityId: 'send_message',  });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'send_message' });
      expect(db.insert).toHaveBeenCalled();
    });
    it('grant workflow: calls addRoleWorkflowPermission', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.manageRoleCapability({ action: 'add', roleId: 'role-1', capabilityId: 'wf-1',  });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-1' });
      expect(db.insert).toHaveBeenCalled();
    });
    it('revoke tool: calls removeRoleToolPermission', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.manageRoleCapability({ action: 'remove', roleId: 'role-1', capabilityId: 'send_message',  });
      expect(result).toEqual({ roleId: 'role-1', toolId: 'send_message', success: true });
      expect(db.delete).toHaveBeenCalled();
    });
    it('revoke workflow: calls removeRoleWorkflowPermission', async () => {
      const { db } = createMockDb();
      const store = createCapabilityStore(db);
      const result = await store.manageRoleCapability({ action: 'remove', roleId: 'role-1', capabilityId: 'wf-1',  });
      expect(result).toEqual({ roleId: 'role-1', workflowId: 'wf-1', success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ── getAgentCapabilities ───────────────────────────────────────────────────
  describe('getAgentCapabilities', () => {
    it('throws when agent not found', async () => {
      const { db, query } = createMockDb();
      query.agents.findFirst.mockResolvedValue(null);
      const store = createCapabilityStore(db);
      await expect(store.getAgentCapabilities('ag-999')).rejects.toThrow('Agent not found');
    });
    it('throws when agent has no roleId', async () => {
      const { db, query } = createMockDb();
      query.agents.findFirst.mockResolvedValue(createMockAgent({ id: 'ag-1', roleId: null }));
      const store = createCapabilityStore(db);
      await expect(store.getAgentCapabilities('ag-1')).rejects.toThrow('Agent is missing roleId: ag-1');
    });
    it('returns granted capabilities for agent with roleId', async () => {
      const { db, query } = createMockDb();
      query.agents.findFirst.mockResolvedValue(createMockAgent({ id: 'ag-1', roleId: 'role-1' }));
      query.roleToolPermissions.findMany.mockResolvedValue([{ roleId: 'role-1', toolId: 'send_message', createdAt: 0 }]);
      query.roleWorkflowPermissions.findMany.mockResolvedValue([]);
      const store = createCapabilityStore(db);
      const result = await store.getAgentCapabilities('ag-1');
      expect(result.toolIds).toContain('send_message');
    });
  });

  // ── listAgentStatuses ──────────────────────────────────────────────────────
  describe('listAgentStatuses', () => {
    it('returns all agents when no filters provided', async () => {
      const { db, query } = createMockDb();
      query.agents.findMany.mockResolvedValue([
        createMockAgent({ id: 'ag-1', executionState: 'running' }),
        createMockAgent({ id: 'ag-2', executionState: 'idle' })
      ]);
      const store = createCapabilityStore(db);
      const result = await store.listAgentStatuses();
      expect(result.length).toBe(2);
    });
    it('filters by agentId when provided', async () => {
      const { db, query } = createMockDb();
      query.agents.findMany.mockImplementation(async ({ where }) => {
        const agents = [
          createMockAgent({ id: 'ag-target', executionState: 'idle' }),
          createMockAgent({ id: 'ag-other', executionState: 'idle' }),
        ];
        // Simple filter: return only the agent that matches
        if (where && typeof where === 'function') {
          const filtered = agents.filter((a) => a.id === 'ag-target');
          return filtered;
        }
        return agents;
      });
      const store = createCapabilityStore(db);
      const result = await store.listAgentStatuses({ agentId: 'ag-target' });
      expect(result.length).toBe(1);
      expect(result[0].agentId).toBe('ag-target');
    });
    it('filters by executionState when provided', async () => {
      const { db, query } = createMockDb();
      query.agents.findMany.mockImplementation(async () => {
        return [createMockAgent({ id: 'ag-1', executionState: 'running' })];
      });
      const store = createCapabilityStore(db);
      const result = await store.listAgentStatuses({ executionState: 'running' });
      expect(result[0].executionState).toBe('running');
    });
    it('filters by both agentId and executionState', async () => {
      const { db, query } = createMockDb();
      query.agents.findMany.mockResolvedValue([
        createMockAgent({ id: 'ag-1', executionState: 'running' })
      ]);
      const store = createCapabilityStore(db);
      const result = await store.listAgentStatuses({ agentId: 'ag-1', executionState: 'running' });
      expect(result.length).toBe(1);
      expect(result[0].agentId).toBe('ag-1');
      expect(result[0].executionState).toBe('running');
    });
  });
});
