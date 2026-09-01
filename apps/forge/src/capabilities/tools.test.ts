import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCapabilityTools } from './tools';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { makeDbMock } from './test-utils/db-mock';

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(),
  manageRole: vi.fn(),
  changeAgentRole: vi.fn(),
  listAgentStatuses: vi.fn(),
  listRoleCapabilities: vi.fn(),
  manageRoleCapability: vi.fn(),
  reloadAgentsForRole: vi.fn(),
  getAgentCapabilities: vi.fn(),
}));

vi.mock('./runtime', () => ({
  changeAgentRole: mocks.changeAgentRole,
  reloadAgentsForRole: mocks.reloadAgentsForRole,
}));

vi.mock('./store', () => ({
  createCapabilityStore: vi.fn(() => ({
    listRoles: mocks.listRoles,
    manageRole: mocks.manageRole,
    changeAgentRole: mocks.changeAgentRole,
    listAgentStatuses: mocks.listAgentStatuses,
    listRoleCapabilities: mocks.listRoleCapabilities,
    manageRoleCapability: mocks.manageRoleCapability,
    getAgentCapabilities: mocks.getAgentCapabilities,
  })),
}));

vi.mock('./catalog', () => ({
  forgeCapabilityIds: [
    'list_agent_roles',
    'manage_agent_role',
    'change_agent_role',
    'list_agent_statuses',
    'list_role_capabilities',
    'manage_role_capabilities',
  ],
  hasToolPermission: vi.fn(),
}));

const { hasToolPermission } = await import('./catalog');

function mockDb() {
  return makeDbMock({});
}
function mockLoaderConfig(): AgentLoaderConfig {
  return { agents: [] } as any;
}

describe('createCapabilityTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  describe('list_agent_roles', () => {
    it('registers tool when permitted', () => {
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      expect(tools).toHaveProperty('list_agent_roles');
    });

    it('omits tool when not permitted', () => {
      (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', new Set());
      expect(tools).not.toHaveProperty('list_agent_roles');
    });

    it('returns roles list on success', async () => {
      mocks.listRoles.mockResolvedValue([{ roleId: 'role-1', name: 'Developer' }]);
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.list_agent_roles as any).execute({});
      expect(result.valid).toBe(true);
      expect(result.data).toEqual([{ roleId: 'role-1', name: 'Developer' }]);
    });

    it('returns valid=false with hint on error', async () => {
      mocks.listRoles.mockRejectedValue(new Error('DB unavailable'));
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.list_agent_roles as any).execute({});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('DB unavailable');
      expect(result.hint).toBe(
        'Try again in a moment. If the problem persists, verify the capability store is available.',
      );
    });
  });

  describe('manage_agent_role', () => {
    it('returns error when create.name missing', async () => {
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_agent_role as any).execute({
        action: 'create',
        create: {},
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('create.name is required');
    });

    it('calls manageRole with create action and returns valid result', async () => {
      mocks.manageRole.mockResolvedValue({ roleId: 'new-role-1', name: 'QA' });
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_agent_role as any).execute({
        action: 'create',
        create: { name: 'QA', description: 'QA role' },
      });
      expect(mocks.manageRole).toHaveBeenCalledWith({
        action: 'create',
        name: 'QA',
        description: 'QA role',
      });
      expect(result.valid).toBe(true);
      expect(result.data.roleId).toBe('new-role-1');
    });

    it('returns error when update.roleId missing', async () => {
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_agent_role as any).execute({
        action: 'update',
        update: {},
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('update.roleId is required');
    });

    it('returns error when delete.roleId missing', async () => {
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_agent_role as any).execute({
        action: 'delete',
        delete: {},
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('delete.roleId is required');
    });

    it('calls manageRole with delete action', async () => {
      mocks.manageRole.mockResolvedValue({ roleId: 'deleted-role-1' });
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_agent_role as any).execute({
        action: 'delete',
        delete: { roleId: 'deleted-role-1' },
      });
      expect(mocks.manageRole).toHaveBeenCalledWith({
        action: 'delete',
        roleId: 'deleted-role-1',
      });
      expect(result.valid).toBe(true);
    });

    it('returns valid=false on manageRole exception', async () => {
      mocks.manageRole.mockRejectedValue(new Error('Write failed'));
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_agent_role as any).execute({
        action: 'create',
        create: { name: 'New Role' },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Write failed');
    });
  });

  describe('change_agent_role', () => {
    it('calls changeAgentRole with correct args and returns valid result', async () => {
      mocks.changeAgentRole.mockResolvedValue({ agentId: 'agent-2', roleId: 'role-1' });
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.change_agent_role as any).execute({
        agentId: 'agent-2',
        roleId: 'role-1',
      });
      expect(mocks.changeAgentRole).toHaveBeenCalledWith({
        db: mockDb(),
        loaderConfig: mockLoaderConfig(),
        actorAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        roleId: 'role-1',
      });
      expect(result.valid).toBe(true);
    });

    it('returns valid=false on exception', async () => {
      mocks.changeAgentRole.mockRejectedValue(new Error('Unauthorized'));
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.change_agent_role as any).execute({
        agentId: 'agent-2',
        roleId: 'role-1',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('list_agent_statuses', () => {
    it('returns status list on success', async () => {
      mocks.listAgentStatuses.mockResolvedValue([{ agentId: 'agent-1', status: 'idle' }]);
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.list_agent_statuses as any).execute({});
      expect(result.valid).toBe(true);
      expect(result.data).toEqual([{ agentId: 'agent-1', status: 'idle' }]);
    });

    it('returns valid=false with hint on error', async () => {
      mocks.listAgentStatuses.mockRejectedValue(new Error('Store unavailable'));
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.list_agent_statuses as any).execute({});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Store unavailable');
    });
  });

  describe('list_role_capabilities', () => {
    it('calls listRoleCapabilities and returns capability list', async () => {
      mocks.listRoleCapabilities.mockResolvedValue([
        { capabilityId: 'list_agent_roles', granted: true },
        { capabilityId: 'manage_agent_role', granted: false },
      ]);
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.list_role_capabilities as any).execute({ roleId: 'role-1' });
      expect(mocks.listRoleCapabilities).toHaveBeenCalledWith('role-1');
      expect(result.valid).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('returns valid=false on exception', async () => {
      mocks.listRoleCapabilities.mockRejectedValue(new Error('DB error'));
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.list_role_capabilities as any).execute({ roleId: 'role-1' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });

  describe('manage_role_capabilities', () => {
    it('calls manageRoleCapability with add action and reloads agents', async () => {
      mocks.manageRoleCapability.mockResolvedValue({
        roleId: 'role-1',
        capabilityId: 'manage_agent_role',
      });
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_role_capabilities as any).execute({
        roleId: 'role-1',
        action: 'add',
        capabilityId: 'manage_agent_role',
      });
      expect(mocks.manageRoleCapability).toHaveBeenCalledWith({
        action: 'add',
        roleId: 'role-1',
        capabilityId: 'manage_agent_role',
      });
      expect(mocks.reloadAgentsForRole).toHaveBeenCalledWith(
        mockDb(),
        mockLoaderConfig(),
        'role-1',
      );
      expect(result.valid).toBe(true);
    });

    it('calls manageRoleCapability with remove action', async () => {
      mocks.manageRoleCapability.mockResolvedValue({
        roleId: 'role-1',
        capabilityId: 'manage_agent_role',
      });
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_role_capabilities as any).execute({
        roleId: 'role-1',
        action: 'remove',
        capabilityId: 'manage_agent_role',
      });
      expect(mocks.manageRoleCapability).toHaveBeenCalledWith({
        action: 'remove',
        roleId: 'role-1',
        capabilityId: 'manage_agent_role',
      });
      expect(result.valid).toBe(true);
    });

    it('returns valid=false on exception', async () => {
      mocks.manageRoleCapability.mockRejectedValue(new Error('Store error'));
      const tools = createCapabilityTools(mockDb(), mockLoaderConfig(), 'agent-1', null);
      const result = await (tools.manage_role_capabilities as any).execute({
        roleId: 'role-1',
        action: 'add',
        capabilityId: 'manage_agent_role',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Store error');
    });
  });
});
