import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadAgentRuntimeData } from './agent-loader-data';

const mocks = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  findManyMock: vi.fn(),
  getProfileMock: vi.fn(),
  getSettingsMock: vi.fn(),
  getRoleMock: vi.fn(),
  getAgentCapabilitiesMock: vi.fn(),
  resolveProfileRuntimeModelMock: vi.fn(),
  decryptSecretMock: vi.fn(),
  loadCommunicationProvidersMock: vi.fn(),
}));

vi.mock('../llm/settings-store', () => ({
  createLlmSettingsStore: vi.fn(() => ({ getProfile: mocks.getProfileMock })),
}));

vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: vi.fn(() => ({ getSettings: mocks.getSettingsMock })),
}));

vi.mock('../capabilities/store', () => ({
  createCapabilityStore: vi.fn(() => ({
    getRole: mocks.getRoleMock,
    getAgentCapabilities: mocks.getAgentCapabilitiesMock,
  })),
}));

vi.mock('../llm/runtime-model', () => ({
  resolveProfileRuntimeModel: mocks.resolveProfileRuntimeModelMock,
}));

vi.mock('../encryption/crypto', () => ({
  decryptSecret: mocks.decryptSecretMock,
}));

vi.mock('../communication/provider-loader', () => ({
  loadCommunicationProviders: mocks.loadCommunicationProvidersMock,
}));

function createMockDb() {
  return {
    query: {
      agents: { findFirst: mocks.findFirstMock },
      agentProviders: { findMany: mocks.findManyMock },
    },
  };
}

function createMockConfig() {
  return {
    agentId: 'agent-123',
    internalChat: {},
  };
}

describe('loadAgentRuntimeData', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findFirstMock.mockResolvedValue({
      id: 'agent-123',
      roleId: 'role-1',
      modelProfileId: 'profile-1',
      omModelProfileId: 'om-profile-1',
    });

    mocks.findManyMock.mockResolvedValue([]);

    mocks.getProfileMock.mockResolvedValue({ id: 'profile-1', name: 'Primary' });
    mocks.getSettingsMock.mockResolvedValue({ companyName: 'Acme' });
    mocks.getRoleMock.mockResolvedValue({ id: 'role-1', name: 'Developer' });
    mocks.getAgentCapabilitiesMock.mockResolvedValue({});
    mocks.resolveProfileRuntimeModelMock.mockResolvedValue({ model: 'gpt-4' });
    mocks.decryptSecretMock.mockReturnValue('{}');
    mocks.loadCommunicationProvidersMock.mockReturnValue({});
  });

  it('throws when agent not found in registry', async () => {
    mocks.findFirstMock.mockResolvedValue(null);

    await expect(loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any))
      .rejects.toThrow('Agent not found in registry: agent-123');
  });

  it('throws when agent is missing roleId', async () => {
    mocks.findFirstMock.mockResolvedValue({ id: 'agent-123', roleId: null });

    await expect(loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any))
      .rejects.toThrow('Agent is missing roleId: agent-123');
  });

  it('returns runtime data with all required fields', async () => {
    const result = await loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any);

    expect(result).toHaveProperty('agent');
    expect(result).toHaveProperty('role');
    expect(result).toHaveProperty('capabilitySet');
    expect(result).toHaveProperty('companySettings');
    expect(result).toHaveProperty('primaryProfile');
    expect(result).toHaveProperty('omProfile');
    expect(result).toHaveProperty('primaryRuntimeModel');
    expect(result).toHaveProperty('omRuntimeModel');
    expect(result).toHaveProperty('providerCredentials');
    expect(result).toHaveProperty('providers');
  });

  it('includes provider credentials from encrypted configs', async () => {
    mocks.findManyMock.mockResolvedValue([
      {
        providerType: 'discord',
        encryptedCredentials: 'encrypted-discord-data',
      },
    ]);
    mocks.decryptSecretMock.mockReturnValue('{"token":"abc123"}');

    const result = await loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any);

    expect(result.providerCredentials).toHaveProperty('discord');
    expect(mocks.decryptSecretMock).toHaveBeenCalledWith('encrypted-discord-data');
  });

  it('skips providers not in communicationProviderTypes', async () => {
    mocks.findManyMock.mockResolvedValue([
      { providerType: 'slack', encryptedCredentials: 'bad' },
    ]);

    await loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any);

    expect(mocks.decryptSecretMock).not.toHaveBeenCalled();
  });

  it('propagates decrypt error (invalid ciphertext)', async () => {
    mocks.findManyMock.mockResolvedValue([
      { providerType: 'discord', encryptedCredentials: 'corrupt' },
    ]);
    mocks.decryptSecretMock.mockImplementation(() => {
      throw new Error('decrypt failed');
    });

    await expect(
      loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any),
    ).rejects.toThrow('decrypt failed');
  });

  it('propagates JSON parse error (invalid credentials)', async () => {
    mocks.findManyMock.mockResolvedValue([
      { providerType: 'discord', encryptedCredentials: 'encrypted-discord-data' },
    ]);
    mocks.decryptSecretMock.mockReturnValue('not-valid-json');

    await expect(
      loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any),
    ).rejects.toThrow();
  });

  it('calls loadCommunicationProviders with correct args', async () => {
    const config = createMockConfig();

    await loadAgentRuntimeData(createMockDb() as any, config as any);

    expect(mocks.loadCommunicationProvidersMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ internalChat: {} }),
    );
  });

  it('resolves both primary and om runtime models', async () => {
    await loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any);

    expect(mocks.resolveProfileRuntimeModelMock).toHaveBeenCalledTimes(2);
  });

  it('returns empty providerCredentials when no providers configured', async () => {
    mocks.findManyMock.mockResolvedValue([]);

    const result = await loadAgentRuntimeData(createMockDb() as any, createMockConfig() as any);

    expect(result.providerCredentials).toEqual({});
  });
});
