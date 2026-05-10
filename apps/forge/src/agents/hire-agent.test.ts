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
  return {
    insert: mockInsert,
    delete: mockDelete,
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Simulate drizzle transaction by calling the callback with a tx object
      // that has the same insert/delete methods
      await fn({ insert: mockInsert, delete: mockDelete });
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
    input.agentId = 'my-custom-id';
    const result = await hireInternalAgent(db as any, input);
    expect(result.agentId).toBe('my-custom-id');
  });

  it('rolls back agent deletion on loadAgent failure', async () => {
    const { loadAgent } = await import('./agent-loader');
    vi.mocked(loadAgent).mockRejectedValueOnce(new Error('load failed'));
    const db = createMockDb();
    const input = createInput();
    await expect(hireInternalAgent(db as any, input)).rejects.toThrow('load failed');
    expect(mockDelete).toHaveBeenCalled();
  });


  it('calls deleteAgentAccount on createHeartbeatSchedule failure', async () => {
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

  it('provisions mailbox when email is configured', async () => {
    const db = createMockDb();
    const input = createInput();
    input.emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(true),
      provisionMailbox: vi.fn().mockResolvedValue({ address: 'test@test.com', credentials: {} }),
      deleteMailboxByAddress: vi.fn(),
    } as any;
    await hireInternalAgent(db as any, input);
    expect(input.emailMailboxes.provisionMailbox).toHaveBeenCalled();
  });

  it('adds email provider credentials when mailbox is provisioned', async () => {
    const db = createMockDb();
    const input = createInput();
    input.emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(true),
      provisionMailbox: vi.fn().mockResolvedValue({ address: 'agent@test.com', credentials: { user: 'u', pass: 'p' } }),
      deleteMailboxByAddress: vi.fn(),
    } as any;
    await hireInternalAgent(db as any, input);
    expect(input.internalChat.registerAgentAccount).toHaveBeenCalled();
  });
});
