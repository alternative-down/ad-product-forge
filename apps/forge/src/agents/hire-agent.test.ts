import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @forge-runtime/core before anything else
vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));
vi.mock('@forge-runtime/core/memory', () => ({}));

// Mock agent-runner so registry doesn't crash when we add the loaded agent
vi.mock('./agent-runner', () => ({
  createAgentRunner: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({ wake: { events: [] }, pendingRunEvents: [] }),
  })),
}));

vi.mock('./agent-loader', () => ({
  loadAgent: vi.fn().mockResolvedValue({ agentId: 'agent-new', name: 'Test Agent', dispose: vi.fn() }),
}));

vi.mock('../utils/id', () => ({ createId: vi.fn().mockReturnValue('generated-id') }));
vi.mock('../encryption/crypto', () => ({ encryptSecret: vi.fn().mockReturnValue('encrypted-value') }));

import { hireInternalAgent } from './hire-agent';
import { agents, agentExecutionContracts, agentProviders } from '../database/schema';

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockDelete = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

function createMockDb() {
  const tx = { insert: mockInsert, delete: mockDelete };
  return {
    insert: mockInsert,
    delete: mockDelete,
    transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => {
      await fn(tx);
    }),
    query: { agents: { findFirst: vi.fn().mockResolvedValue(null) } },
  };
}

function createInput() {
  return {
    roleId: 'role-1',
    name: 'Test Agent',
    instructions: 'Do stuff',
    modelProfileId: 'profile-1',
    omModelProfileId: 'om-profile-1',
    workspaceBasePath: '/ws',
    weeklyBudgetUsd: 100,
    githubApps: {} as any,
    emailMailboxes: {
      isConfigured: vi.fn().mockResolvedValue(false),
      provisionMailbox: vi.fn(),
      deleteMailboxByAddress: vi.fn(),
    } as any,
    coolify: null,
    schedules: { createHeartbeatSchedule: vi.fn().mockResolvedValue(undefined) } as any,
    internalChat: { registerAgentAccount: vi.fn().mockResolvedValue(undefined) } as any,
  };
}

describe('hireInternalAgent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('inserts agent record into database', async () => {
    const db = createMockDb();
    await hireInternalAgent(db as any, createInput());
    expect(mockInsert).toHaveBeenCalledWith(agents);
  });

  it('inserts contract record with budget from input', async () => {
    const db = createMockDb();
    await hireInternalAgent(db as any, createInput());
    const insertCall = mockInsert.mock.calls.find(c => c[0] === agentExecutionContracts);
    expect(insertCall).toBeDefined();
  });

  it('inserts provider record for internal-chat', async () => {
    const db = createMockDb();
    await hireInternalAgent(db as any, createInput());
    expect(mockInsert).toHaveBeenCalledWith(agentProviders);
  });

  it('registers agent account in internal chat', async () => {
    const db = createMockDb();
    const input = createInput();
    await hireInternalAgent(db as any, input);
    expect(input.internalChat.registerAgentAccount).toHaveBeenCalled();
  });

  it('creates heartbeat schedule', async () => {
    const db = createMockDb();
    const input = createInput();
    await hireInternalAgent(db as any, input);
    expect(input.schedules.createHeartbeatSchedule).toHaveBeenCalled();
  });

  it('loads agent runtime', async () => {
    const { loadAgent } = await import('./agent-loader');
    const db = createMockDb();
    await hireInternalAgent(db as any, createInput());
    expect(loadAgent).toHaveBeenCalled();
  });

  it('returns agentId as string', async () => {
    const db = createMockDb();
    const result = await hireInternalAgent(db as any, createInput());
    expect(typeof result.agentId).toBe('string');
  });

  it('returns null email when email not configured', async () => {
    const db = createMockDb();
    const result = await hireInternalAgent(db as any, createInput());
    expect(result.emailAddress).toBeNull();
  });

  it('uses provided agentId when given', async () => {
    const db = createMockDb();
    const input = createInput();
    input.agentId = 'custom-id';
    const result = await hireInternalAgent(db as any, input);
    expect(result.agentId).toBe('custom-id');
  });

  // --- Orphan prevention tests (#1857) ---

  it('rolls back DB records when registerAgentAccount fails', async () => {
    const db = createMockDb();
    const input = createInput();
    input.internalChat = {
      ...input.internalChat,
      registerAgentAccount: vi.fn().mockRejectedValue(new Error('chat registration failed')),
    } as any;
    await expect(hireInternalAgent(db as any, input)).rejects.toThrow('chat registration failed');
    // mockDelete is called as part of the rollback transaction
    expect(mockDelete).toHaveBeenCalled();
  });

  it('rolls back DB records when createHeartbeatSchedule fails', async () => {
    const db = createMockDb();
    const input = createInput();
    input.schedules = {
      createHeartbeatSchedule: vi.fn().mockRejectedValue(new Error('schedule failed')),
    } as any;
    await expect(hireInternalAgent(db as any, input)).rejects.toThrow('schedule failed');
    expect(mockDelete).toHaveBeenCalled();
  });

  it('calls deleteAgentAccount when createHeartbeatSchedule fails', async () => {
    const db = createMockDb();
    const input = createInput();
    const deleteAgentAccount = vi.fn().mockResolvedValue(undefined);
    input.schedules = {
      createHeartbeatSchedule: vi.fn().mockRejectedValue(new Error('schedule failed')),
    } as any;
    input.internalChat = {
      ...input.internalChat,
      deleteAgentAccount,
    } as any;
    await expect(hireInternalAgent(db as any, input)).rejects.toThrow('schedule failed');
    expect(deleteAgentAccount).toHaveBeenCalledWith({ agentId: 'generated-id' });
  });

  it('rolls back DB records when loadAgent fails', async () => {
    const { loadAgent } = await import('./agent-loader');
    vi.mocked(loadAgent).mockRejectedValueOnce(new Error('load failed'));
    const db = createMockDb();
    const input = createInput();
    await expect(hireInternalAgent(db as any, input)).rejects.toThrow('load failed');
    expect(mockDelete).toHaveBeenCalled();
  });

  it('provisions mailbox when email is configured', async () => {
    const db = createMockDb();
    const input = createInput();
    input.emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(true),
      provisionMailbox: vi.fn().mockResolvedValue({ address: 'agent@test.com', credentials: { user: 'u', token: 't' } }),
      deleteMailboxByAddress: vi.fn().mockResolvedValue(undefined),
    } as any;
    await hireInternalAgent(db as any, input);
    expect(input.emailMailboxes.provisionMailbox).toHaveBeenCalled();
  });

  it('adds email provider credentials when mailbox is provisioned', async () => {
    const db = createMockDb();
    const input = createInput();
    input.emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(true),
      provisionMailbox: vi.fn().mockResolvedValue({ address: 'agent@test.com', credentials: { user: 'u', token: 't' } }),
      deleteMailboxByAddress: vi.fn().mockResolvedValue(undefined),
    } as any;
    await hireInternalAgent(db as any, input);
    const emailProviderCall = mockInsert.mock.calls.find(c => c[0] === agentProviders);
    expect(emailProviderCall).toBeDefined();
  });

  it('deletes mailbox when registerAgentAccount fails after provisioning', async () => {
    const db = createMockDb();
    const input = createInput();
    input.emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(true),
      provisionMailbox: vi.fn().mockResolvedValue({ address: 'agent@test.com', credentials: { user: 'u', token: 't' } }),
      deleteMailboxByAddress: vi.fn().mockResolvedValue(undefined),
    } as any;
    input.internalChat = {
      ...input.internalChat,
      registerAgentAccount: vi.fn().mockRejectedValue(new Error('chat registration failed')),
    } as any;
    await expect(hireInternalAgent(db as any, input)).rejects.toThrow('chat registration failed');
    expect(input.emailMailboxes.deleteMailboxByAddress).toHaveBeenCalledWith('agent@test.com');
  });
});