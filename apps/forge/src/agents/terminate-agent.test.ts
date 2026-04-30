import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRemove, mockContractStoreRefund, mockRm, mockContractStore } = vi.hoisted(() => ({
  mockRemove: vi.fn(),
  mockContractStoreRefund: vi.fn().mockResolvedValue(undefined),
  mockRm: vi.fn().mockResolvedValue(undefined),
  mockContractStore: vi.fn(() => ({
    refundActiveContractBalance: mockContractStoreRefund,
  })),
}));

vi.mock('./internal-agent-registry', () => ({
  getInternalAgentRegistry: vi.fn(() => ({
    remove: mockRemove,
  })),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: mockContractStore,
}));

vi.mock('node:fs/promises', () => ({
  rm: mockRm,
}));

import { terminateInternalAgent } from './terminate-agent';
import { createAgentContractStore } from './agent-contract-store';

function createMockDb(agent = { id: 'agent-1', name: 'Test Agent' }) {
  return {
    query: {
      agents: {
        findFirst: vi.fn().mockResolvedValue(agent),
      },
    },
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function createMockGithubApps() {
  return {
    deleteAgentApp: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEmailMailboxes() {
  return {
    isConfigured: vi.fn().mockResolvedValue(true),
    deleteAgentMailbox: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSchedules() {
  return {
    removeAgent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('terminateInternalAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when agent not found', async () => {
    const db = createMockDb(null);
    const fn = terminateInternalAgent(db as any, {
      agentId: 'nonexistent',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    await expect(fn).rejects.toThrow('Agent not found: nonexistent');
  });

  it('creates contract store with db parameter', async () => {
    const db = createMockDb() as any;
    await terminateInternalAgent(db, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(createAgentContractStore).toHaveBeenCalledWith(db);
  });

  it('removes agent from internal registry', async () => {
    const db = createMockDb();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(mockRemove).toHaveBeenCalledWith('agent-1');
  });

  it('calls schedules.removeAgent', async () => {
    const db = createMockDb();
    const schedules = createMockSchedules();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: schedules as any,
    });
    expect(schedules.removeAgent).toHaveBeenCalledWith('agent-1');
  });

  it('deletes email mailbox when configured and isConfigured returns true', async () => {
    const db = createMockDb();
    const emailMailboxes = createMockEmailMailboxes();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: emailMailboxes as any,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(emailMailboxes.isConfigured).toHaveBeenCalled();
    expect(emailMailboxes.deleteAgentMailbox).toHaveBeenCalledWith('agent-1');
  });

  it('does not delete email mailbox when isConfigured returns false', async () => {
    const db = createMockDb();
    const emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(false),
      deleteAgentMailbox: vi.fn(),
    };
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: emailMailboxes as any,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(emailMailboxes.deleteAgentMailbox).not.toHaveBeenCalled();
  });

  it('calls githubApps.deleteAgentApp', async () => {
    const db = createMockDb();
    const githubApps = createMockGithubApps();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: githubApps as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(githubApps.deleteAgentApp).toHaveBeenCalledWith('agent-1');
  });

  it('calls db.delete with agents table', async () => {
    const db = createMockDb();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(db.delete).toHaveBeenCalled();
  });

  it('calls rm with resolved workspace path for agent', async () => {
    const db = createMockDb();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/base/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(mockRm).toHaveBeenCalledWith(
      '/base/workspaces/agent-1',
      expect.objectContaining({ recursive: true, force: true })
    );
  });

  it('returns object with agentId', async () => {
    const db = createMockDb();
    const result = await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(result).toEqual({ agentId: 'agent-1' });
  });

  it('calls rm with correct agent-specific workspace path', async () => {
    const db = createMockDb();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-abc-123',
      workspaceBasePath: '/path/to/workspaces',
      githubApps: createMockGithubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(mockRm).toHaveBeenCalledWith('/path/to/workspaces/agent-abc-123', expect.any(Object));
  });

  it('handles null emailMailboxes gracefully', async () => {
    const db = createMockDb();
    const githubApps = createMockGithubApps();
    const schedules = createMockSchedules();
    await terminateInternalAgent(db as any, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspaces',
      githubApps: githubApps as any,
      emailMailboxes: null,
      coolify: null,
      schedules: schedules as any,
    });
    expect(githubApps.deleteAgentApp).toHaveBeenCalled();
    expect(schedules.removeAgent).toHaveBeenCalled();
  });

  it('passes correct agentId to githubApps.deleteAgentApp', async () => {
    const db = createMockDb({ id: 'specific-agent-id', name: 'Test' });
    const githubApps = { deleteAgentApp: vi.fn().mockResolvedValue(undefined) };
    await terminateInternalAgent(db as any, {
      agentId: 'specific-agent-id',
      workspaceBasePath: '/workspaces',
      githubApps: githubApps as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });
    expect(githubApps.deleteAgentApp).toHaveBeenCalledWith('specific-agent-id');
  });
});
