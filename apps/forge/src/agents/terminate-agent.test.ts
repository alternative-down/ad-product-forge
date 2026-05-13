import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRefundBalance, mockRemoveAgent, mockRemoveSchedule, mockDeleteMailbox, mockDeleteApp, mockRm } = vi.hoisted(() => ({
  mockRefundBalance: vi.fn().mockResolvedValue(undefined),
  mockRemoveAgent: vi.fn(),
  mockRemoveSchedule: vi.fn().mockResolvedValue(undefined),
  mockDeleteMailbox: vi.fn().mockResolvedValue(undefined),
  mockDeleteApp: vi.fn().mockResolvedValue(undefined),
  mockRm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => ({ refundActiveContractBalance: mockRefundBalance })),
}));

vi.mock('./internal-agent-registry', () => ({
  getInternalAgentRegistry: vi.fn(() => ({ remove: mockRemoveAgent })),
}));

vi.mock('node:fs/promises', () => ({ rm: mockRm }));

import { terminateInternalAgent } from './terminate-agent';
// import { agents } from '../database/client'; // removed
type AgentEmailManager = any;
type CoolifyManager = any;

function createMockDb(agent?: Record<string, unknown> | null) {
  return {
    query: { agents: { findFirst: vi.fn().mockResolvedValue(agent ?? null) } },
    delete: vi.fn().mockImplementation((table: { tableName?: string }) => ({
      where: vi.fn().mockResolvedValue(undefined),
      _table: table,
    })),
  };
}

function mockAgent(overrides: Record<string, unknown> = {}) {
  return { id: 'agent-1', name: 'Test Agent', createdAt: Date.now(), ...overrides };
}

const mockSchedules = { removeAgent: mockRemoveSchedule };
const mockEmail = { deleteAgentMailbox: mockDeleteMailbox, isConfigured: vi.fn().mockResolvedValue(true) } as unknown as AgentEmailManager;
const mockCoolify = { deleteAgentApp: mockDeleteApp } as unknown as CoolifyManager;
const mockGitHubApps = { deleteAgentApp: mockDeleteApp } as unknown as ReturnType<AgentEmailManager['deleteAgentMailbox']> extends never ? object : any;

const defaultInput = () => ({
  agentId: 'agent-1',
  workspaceBasePath: '/ws',
  githubApps: mockGitHubApps,
  emailMailboxes: mockEmail,
  coolify: mockCoolify,
  schedules: mockSchedules,
});

describe('terminateInternalAgent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws when agent not found', async () => {
    const db = createMockDb(null);
    await expect(terminateInternalAgent(db as any, defaultInput() as any)).rejects.toThrow('Agent not found: agent-1');
  });

  it('refunds active contract balance', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    expect(mockRefundBalance).toHaveBeenCalledWith('agent-1');
  });

  it('removes agent from internal registry', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    expect(mockRemoveAgent).toHaveBeenCalledWith('agent-1');
  });

  it('removes agent from schedule manager', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    expect(mockRemoveSchedule).toHaveBeenCalledWith('agent-1');
  });

  it('deletes agent mailbox when email is configured', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    expect(mockDeleteMailbox).toHaveBeenCalledWith('agent-1');
  });

  it('does not call delete mailbox when email is not configured', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, { ...defaultInput(), emailMailboxes: null } as any);
    expect(mockDeleteMailbox).not.toHaveBeenCalled();
  });

  it('deletes GitHub App for agent', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    expect(mockDeleteApp).toHaveBeenCalledWith('agent-1');
  });

  it('deletes agent record from database', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    // Should delete: agentExecutionContracts + agentProviders + agents
    expect((db.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((db.delete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('removes agent workspace directory', async () => {
    const db = createMockDb(mockAgent());
    await terminateInternalAgent(db as any, defaultInput() as any);
    expect(mockRm).toHaveBeenCalledWith('/ws/agent-1', { recursive: true, force: true });
  });

  it('returns object with agentId', async () => {
    const db = createMockDb(mockAgent({ id: 'agent-xyz' }));
    const result = await terminateInternalAgent(db as any, { ...defaultInput(), agentId: 'agent-xyz' } as any);
    expect(result.agentId).toBe('agent-xyz');
  });
});
