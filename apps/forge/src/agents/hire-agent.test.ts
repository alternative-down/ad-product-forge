import { describe, expect, it, vi, beforeEach } from 'vitest';
import { hireInternalAgent, type HireInternalAgentInput } from './hire-agent';
import { agents, agentExecutionContracts, agentProviders } from '../database/schema';

const mocks = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'generated-id'),
  insertMock: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  deleteMock: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  encryptSecretMock: vi.fn((v: string) => `encrypted:${v}`),
  addMock: vi.fn(),
  removeMock: vi.fn(),
  loadAgentMock: vi.fn(),
  provisionMailboxMock: vi.fn(),
  isConfiguredMock: vi.fn(),
  createHeartbeatScheduleMock: vi.fn(),
  registerAgentAccountMock: vi.fn(),
}));

vi.mock('../utils/id', () => ({ createId: mocks.createIdMock }));
vi.mock('../encryption/crypto', () => ({ encryptSecret: mocks.encryptSecretMock }));
vi.mock('./internal-agent-registry', () => ({
  getInternalAgentRegistry: () => ({
    add: mocks.addMock,
    remove: mocks.removeMock,
  }),
}));
vi.mock('./agent-loader', () => ({ loadAgent: mocks.loadAgentMock }));

function createMockDb() {
  return {
    insert: mocks.insertMock,
    delete: mocks.deleteMock,
  };
}

function createMockSchedules() {
  return {
    createHeartbeatSchedule: mocks.createHeartbeatScheduleMock.mockResolvedValue(undefined),
  };
}

function createMockInternalChat() {
  return {
    registerAgentAccount: mocks.registerAgentAccountMock.mockResolvedValue(undefined),
  };
}

function createMinimalInput(): HireInternalAgentInput {
  return {
    roleId: 'role-1',
    name: 'Test Agent',
    instructions: 'Test instructions',
    modelProfileId: 'profile-1',
    omModelProfileId: 'om-profile-1',
    workspaceBasePath: '/workspace/test',
    weeklyBudgetUsd: 100,
    providerCredentials: {},
    githubApps: {} as any,
    emailMailboxes: null,
    coolify: null,
    schedules: createMockSchedules(),
    internalChat: createMockInternalChat(),
  };
}

describe('hireInternalAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertMock.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mocks.deleteMock.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mocks.addMock.mockResolvedValue(undefined);
    mocks.loadAgentMock.mockResolvedValue(undefined);
    mocks.registerAgentAccountMock.mockResolvedValue(undefined);
    mocks.createHeartbeatScheduleMock.mockResolvedValue(undefined);
  });

  it('calls db.insert for database records', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    expect(mocks.insertMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('inserts both agent and contract records', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    // Check that insert was called with the correct table references
    const agentCall = mocks.insertMock.mock.calls.find(call => call[0] === agents);
    const contractCall = mocks.insertMock.mock.calls.find(call => call[0] === agentExecutionContracts);

    expect(agentCall).toBeDefined();
    expect(contractCall).toBeDefined();
  });

  it('adds agent to internal registry after creation', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    expect(mocks.addMock).toHaveBeenCalled();
  });

  it('loads agent after insertion', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    expect(mocks.loadAgentMock).toHaveBeenCalled();
  });

  it('skips email provisioning when emailMailboxes is null', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    expect(mocks.provisionMailboxMock).not.toHaveBeenCalled();
  });

  it('inserts agentProviders for internal-chat', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    const providerCall = mocks.insertMock.mock.calls.find(call => call[0] === agentProviders);
    expect(providerCall).toBeDefined();
  });

  it('cleans up agent on failure', async () => {
    mocks.addMock.mockRejectedValue(new Error('load failure'));

    await expect(hireInternalAgent(createMockDb() as any, createMinimalInput())).rejects.toThrow('load failure');

    expect(mocks.removeMock).toHaveBeenCalledWith('generated-id');
    expect(mocks.deleteMock).toHaveBeenCalled();
  });

  it('registers agent account in internal chat', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    expect(mocks.registerAgentAccountMock).toHaveBeenCalled();
  });

  it('creates heartbeat schedule for agent', async () => {
    await hireInternalAgent(createMockDb() as any, createMinimalInput());

    expect(mocks.createHeartbeatScheduleMock).toHaveBeenCalledWith('generated-id');
  });
});
