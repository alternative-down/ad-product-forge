import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Database } from '../database/client';
import { loadAgent, loadAgents } from './agent-loader';
import type { SingleAgentLoaderConfig, AgentLoaderConfig } from './agent-loader-types';

const mockForgeDebug = vi.hoisted(() => vi.fn());
vi.mock('@forge-runtime/core', async () => {
  const actual = await vi.importActual('@forge-runtime/core');
  return { ...actual, forgeDebug: mockForgeDebug };
});

const mockLoadAgentRuntimeData = vi.hoisted(() => vi.fn());
const mockLoadAgentToolset = vi.hoisted(() => vi.fn());
vi.mock('./agent-loader-data', () => ({ loadAgentRuntimeData: mockLoadAgentRuntimeData }));
vi.mock('./agent-loader-tools', () => ({ loadAgentToolset: mockLoadAgentToolset }));

const mockCreateSystemSettingsStore = vi.hoisted(() => vi.fn());
vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: mockCreateSystemSettingsStore,
}));

const mockCreateAgentRuntime = vi.hoisted(() => vi.fn());
vi.mock('./create-forge-agent', () => ({
  createInternalAgentRuntime: mockCreateAgentRuntime,
}));

const mockCreateAgentContractStore = vi.hoisted(() => vi.fn());
vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: mockCreateAgentContractStore,
}));

// Test fixtures
const mockDb = {} as Database;
const mockInternalChat = {
  registerAgentAccount: vi.fn(),
};

// Mock runtime data with all required fields for buildAgentRuntimeConfig
const mockRuntimeData = {
  agent: { id: 'agent-1', name: 'Test Agent', description: 'A test agent' },
  capabilitySet: { toolIds: ['tool-a', 'tool-b'] },
  providerCredentials: {},
  role: { name: 'Developer', description: 'Does dev work' },
  companySettings: {
    companyName: 'Acme',
    companyContext: 'Test context',
    communicationDmFlushingEnabled: false,
    communicationGroupFlushingEnabled: false,
    memoryLastMessagesFullEnabled: false,
    memoryLastMessagesCount: 10,
    tokenCountFilterEnabled: false,
    tokenCountFilterLimit: 1000,
    checkpointedOmEnabled: true,
    checkpointedOmTotalContextTokens: 100,
    checkpointedOmRecentRawTokens: 50,
    checkpointedOmRawObservationBatchTokens: 10,
    checkpointedOmObservationReflectionBatchTokens: 5,
    checkpointedOmObservationSupportTokens: 5,
    checkpointedOmReflectionSupportTokens: 5,
    ltmRecallScoreThreshold: 0.5,
    ltmRecallDocumentCount: 5,
  },
  primaryRuntimeModel: { id: 'model-1', name: 'Test Model' },
  primaryProfile: { modelKey: 'test-key', profileId: 'profile-1' },
  omRuntimeModel: { id: 'om-model-1', name: 'OM Model' },
  omProfile: { modelKey: 'om-key', profileId: 'om-profile-1' },
  providers: [],
};

const mockToolset = {
  breakdown: { total: 2 },
  tools: [],
};

function makeConfig(overrides?: Partial<SingleAgentLoaderConfig>): any {
  return {
    agentId: 'agent-1',
    workspaceBasePath: '/workspace',
    githubApps: {},
    emailMailboxes: {},
    coolify: {},
    minimax: {},
    schedules: {},
    internalChat: mockInternalChat as any,
    ...overrides,
  };
}

function makeSettings(overrides?: Record<string, unknown>) {
  return {
    checkpointedOmTotalContextTokens: 100,
    checkpointedOmRecentRawTokens: 50,
    checkpointedOmRawObservationBatchTokens: 10,
    checkpointedOmObservationReflectionBatchTokens: 5,
    checkpointedOmObservationSupportTokens: 5,
    checkpointedOmReflectionSupportTokens: 5,
    ltmRecallSearchMode: 'vector',
    ltmRecallWorkspaceTopK: 10,
    ltmRecallGraphTopK: 5,
    ltmRecallGraphThreshold: 0.7,
    ltmRecallGraphRandomWalkSteps: 3,
    ltmRecallGraphIncludeSources: true,
    ltmRecallScoreThreshold: 0.5,
    ltmRecallDocumentCount: 5,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadAgentRuntimeData.mockResolvedValue(mockRuntimeData);
  mockLoadAgentToolset.mockResolvedValue(mockToolset);
  mockCreateSystemSettingsStore.mockReturnValue({
    getSettings: vi.fn().mockResolvedValue(makeSettings()),
  });
  mockCreateAgentRuntime.mockResolvedValue({ id: 'runtime-1' } as any);
  mockCreateAgentContractStore.mockReturnValue({});
});

describe('loadAgent', () => {
  it('loads runtime data and toolset for the agent', async () => {
    const config = makeConfig({ agentId: 'agent-abc' });

    await loadAgent(mockDb, config);

    expect(mockLoadAgentRuntimeData).toHaveBeenCalledWith(mockDb, config);
    expect(mockLoadAgentToolset).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mockDb,
        agentId: 'agent-1',
        allowedToolIds: new Set(['tool-a', 'tool-b']),
      }),
    );
  });

  it('registers the agent account with internal chat', async () => {
    const credentials = {
      'internal-chat': { displayName: 'Custom Display' },
    };
    mockLoadAgentRuntimeData.mockResolvedValue({
      ...mockRuntimeData,
      providerCredentials: credentials,
    });
    const config = makeConfig();

    await loadAgent(mockDb, config);

    expect(mockInternalChat.registerAgentAccount).toHaveBeenCalledWith({
      agentId: 'agent-1',
      displayName: 'Custom Display',
      agentName: 'Test Agent',
      agentDescription: 'A test agent',
      roleName: 'Developer',
      roleDescription: 'Does dev work',
    });
  });

  it('falls back to agent name when internal-chat displayName is missing', async () => {
    mockLoadAgentRuntimeData.mockResolvedValue({
      ...mockRuntimeData,
      providerCredentials: {},
    });
    const config = makeConfig();

    await loadAgent(mockDb, config);

    expect(mockInternalChat.registerAgentAccount).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Test Agent' }),
    );
  });

  it('passes system settings to runtime memory settings', async () => {
    const settings = makeSettings({ ltmRecallSearchMode: 'hybrid' });
    mockCreateSystemSettingsStore.mockReturnValue({
      getSettings: vi.fn().mockResolvedValue(settings),
    });
    const config = makeConfig();

    await loadAgent(mockDb, config);

    expect(mockCreateAgentRuntime).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        readRuntimeMemorySettings: expect.any(Function),
      }),
    );
    const [, opts] = mockCreateAgentRuntime.mock.calls[0];
    const memSettings = await opts.readRuntimeMemorySettings();
    expect(memSettings.ltmRecallSearchMode).toBe('hybrid');
    expect(memSettings.checkpointedOmTotalContextTokens).toBe(100);
  });

  it('creates runtime with longTermMemory enabled and contract store', async () => {
    const config = makeConfig();

    await loadAgent(mockDb, config);

    expect(mockCreateAgentRuntime).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        longTermMemory: true,
        contractStore: expect.any(Object),
      }),
    );
  });

  it('calls createAgentContractStore with the database', async () => {
    const config = makeConfig();

    await loadAgent(mockDb, config);

    expect(mockCreateAgentContractStore).toHaveBeenCalledWith(mockDb);
  });

  it('returns the created runtime instance', async () => {
    const mockRuntime = { id: 'runtime-xyz', name: 'My Runtime' };
    mockCreateAgentRuntime.mockResolvedValue(mockRuntime as any);
    const config = makeConfig();

    const result = await loadAgent(mockDb, config);

    expect(result).toBe(mockRuntime);
  });

  it('logs debug messages at each stage', async () => {
    const config = makeConfig();

    await loadAgent(mockDb, config);

    const debugCalls = mockForgeDebug.mock.calls.map((c) => c[0].message);
    expect(debugCalls).toContain('Loading agent');
    expect(debugCalls).toContain('Allowed tool IDs');
    expect(debugCalls).toContain('Tools loaded');
    expect(debugCalls).toContain('Agent loaded successfully');
  });

  it('emits tool ID count in allowed tool IDs debug context', async () => {
    const config = makeConfig();

    await loadAgent(mockDb, config);

    const allowedIdsCall = mockForgeDebug.mock.calls.find(
      (c) => c[0].message === 'Allowed tool IDs',
    );
    expect(allowedIdsCall?.[0].context?.toolIdCount).toBe(2);
  });

  it('sets agentId and agentName on loading agent debug event', async () => {
    const config = makeConfig();

    await loadAgent(mockDb, config);

    const loadCall = mockForgeDebug.mock.calls.find((c) => c[0].message === 'Loading agent');
    expect(loadCall?.[0].agentId).toBe('agent-1');
    expect(loadCall?.[0].agentName).toBe('Test Agent');
  });
});

describe('loadAgents', () => {
  beforeEach(() => {
    // Add agent registry to mockDb
    const dbWithAgents = {
      query: {
        agents: {
          findMany: vi.fn().mockResolvedValue([{ id: 'agent-1' }, { id: 'agent-2' }]),
        },
      },
    } as unknown as Database;
    mockDb.query = dbWithAgents.query;
  });

  it('queries agents from the database', async () => {
    const config = { workspaceBasePath: '/base' } as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    expect(mockDb.query.agents.findMany).toHaveBeenCalled();
  });

  it('returns empty map when no agents are in registry', async () => {
    mockDb.query!.agents.findMany = vi.fn().mockResolvedValue([]);
    const config = { workspaceBasePath: '/base' } as AgentLoaderConfig;

    const result = await loadAgents(mockDb, config);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('logs info when no agents found', async () => {
    mockDb.query!.agents.findMany = vi.fn().mockResolvedValue([]);
    const config = { workspaceBasePath: '/base' } as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    const debugCalls = mockForgeDebug.mock.calls.map((c) => c[0].message);
    expect(debugCalls).toContain('No agents found in registry');
  });

  it('loads each agent with correct config', async () => {
    const config = {
      workspaceBasePath: '/workspace',
      githubApps: { app1: {} },
      emailMailboxes: {},
      coolify: {},
      minimax: {},
      schedules: {},
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    expect(mockLoadAgentRuntimeData).toHaveBeenCalledTimes(2);
  });

  it('returns map keyed by agent ID', async () => {
    const config = {
      workspaceBasePath: '/workspace',
      githubApps: {},
      emailMailboxes: {},
      coolify: {},
      minimax: {},
      schedules: {},
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    const result = await loadAgents(mockDb, config);

    expect(result).toBeInstanceOf(Map);
    expect(result.has('agent-1')).toBe(true);
    expect(result.has('agent-2')).toBe(true);
  });

  it('logs agent count when starting load', async () => {
    const config = {
      workspaceBasePath: '/workspace',
      githubApps: {},
      emailMailboxes: {},
      coolify: {},
      minimax: {},
      schedules: {},
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    const loadFromRegCall = mockForgeDebug.mock.calls.find(
      (c) => c[0].message === 'Loading agents from registry',
    );
    expect(loadFromRegCall?.[0].context?.agentCount).toBe(2);
  });

  it('logs agent count when finished loading', async () => {
    const config = {
      workspaceBasePath: '/workspace',
      githubApps: {},
      emailMailboxes: {},
      coolify: {},
      minimax: {},
      schedules: {},
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    const successCall = mockForgeDebug.mock.calls.find(
      (c) => c[0].message === 'Successfully loaded agents',
    );
    expect(successCall?.[0].context?.agentCount).toBe(2);
  });

  it('continues loading other agents when one fails', async () => {
    mockLoadAgentRuntimeData
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(mockRuntimeData);
    const config = {
      workspaceBasePath: '/workspace',
      githubApps: {},
      emailMailboxes: {},
      coolify: {},
      minimax: {},
      schedules: {},
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    const result = await loadAgents(mockDb, config);

    expect(result.size).toBe(1);
    expect(result.has('agent-2')).toBe(true);
  });

  it('logs error when agent loading fails', async () => {
    mockLoadAgentRuntimeData.mockRejectedValueOnce(new Error('agent-1-error'));
    const config = {
      workspaceBasePath: '/workspace',
      githubApps: {},
      emailMailboxes: {},
      coolify: {},
      minimax: {},
      schedules: {},
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    const errorCall = mockForgeDebug.mock.calls.find(
      (c) => c[0].message === 'Failed to load agent',
    );
    expect(errorCall?.[0].level).toBe('error');
    expect(errorCall?.[0].agentId).toBe('agent-1');
    expect(errorCall?.[0].context?.error).toBeDefined();
  });

  it('passes shared config fields to each loadAgent call', async () => {
    const config = {
      workspaceBasePath: '/my/workspace',
      githubApps: { githubApp1: {} },
      emailMailboxes: { mb1: {} },
      coolify: { c1: {} },
      minimax: { m1: {} },
      schedules: { s1: {} },
      internalChat: mockInternalChat as any,
    } as unknown as AgentLoaderConfig;

    await loadAgents(mockDb, config);

    const firstCall = mockLoadAgentRuntimeData.mock.calls[0];
    const passedConfig = firstCall[1] as SingleAgentLoaderConfig;
    expect(passedConfig.workspaceBasePath).toBe('/my/workspace');
    expect(passedConfig.githubApps).toBe(config.githubApps);
    expect(passedConfig.internalChat).toBe(config.internalChat);
  });
});
