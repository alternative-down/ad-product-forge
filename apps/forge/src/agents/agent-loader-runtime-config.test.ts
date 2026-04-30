import { describe, expect, it } from 'vitest';
import { buildAgentRuntimeConfig } from './agent-loader-runtime-config';
import type { AgentLoaderConfig } from './agent-loader-types';

const mockRuntimeData = {
  agent: {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'A test agent',
    instructions: 'Do the thing',
    workspaceFilesystem: 'host',
    workspaceSandbox: false,
    workspaceSkills: ['skill-1', 'skill-2'],
    workspaceEmbedder: null,
  },
  primaryRuntimeModel: 'gpt-4o' as const,
  primaryProfile: { profileId: 'profile-1', modelKey: 'openai' },
  omRuntimeModel: 'gpt-4o-mini' as const,
  omProfile: { profileId: 'profile-om', modelKey: 'openai' },
  providers: [],
  companySettings: {
    companyName: 'Acme Corp',
    companyContext: 'We make things',
    communicationDmFlushingEnabled: true,
    communicationGroupFlushingEnabled: false,
    memoryLastMessagesFullEnabled: true,
    memoryLastMessagesCount: 50,
    tokenCountFilterEnabled: true,
    tokenCountFilterLimit: 100,
    checkpointedOmEnabled: true,
    checkpointedOmTotalContextTokens: 1000,
    checkpointedOmRecentRawTokens: 500,
    checkpointedOmRawObservationBatchTokens: 100,
    checkpointedOmObservationReflectionBatchTokens: 50,
    checkpointedOmObservationSupportTokens: 200,
    checkpointedOmReflectionSupportTokens: 150,
    ltmRecallScoreThreshold: 0.7,
    ltmRecallDocumentCount: 10,
  },
  role: {
    name: 'Developer',
    description: 'Writes code',
  },
};

const mockToolset = {
  tools: [{ name: 'tool-1' }, { name: 'tool-2' }],
};

const mockLoaderConfig: AgentLoaderConfig = {
  workspaceBasePath: '/workspace',
};

describe('buildAgentRuntimeConfig', () => {
  it('maps agent basic fields correctly', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.id).toBe('agent-1');
    expect(result.name).toBe('Test Agent');
    expect(result.description).toBe('A test agent');
    expect(result.instructions).toBe('Do the thing');
  });

  it('maps primary runtime model and profile', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.model).toBe('gpt-4o');
    expect(result.pricingModelKey).toBe('openai');
    expect(result.modelProfileId).toBe('profile-1');
  });

  it('maps OM runtime model and profile', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.omModel).toBe('gpt-4o-mini');
    expect(result.omPricingModelKey).toBe('openai');
    expect(result.omModelProfileId).toBe('profile-om');
  });

  it('maps company settings fields', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.companyName).toBe('Acme Corp');
    expect(result.companyContext).toBe('We make things');
    expect(result.communicationDmFlushingEnabled).toBe(true);
    expect(result.communicationGroupFlushingEnabled).toBe(false);
    expect(result.memoryLastMessagesFullEnabled).toBe(true);
    expect(result.memoryLastMessagesCount).toBe(50);
    expect(result.tokenCountFilterEnabled).toBe(true);
    expect(result.tokenCountFilterLimit).toBe(100);
  });

  it('maps checkpointed OM settings', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.checkpointedOmEnabled).toBe(true);
    expect(result.checkpointedOmTotalContextTokens).toBe(1000);
    expect(result.checkpointedOmRecentRawTokens).toBe(500);
    expect(result.checkpointedOmRawObservationBatchTokens).toBe(100);
    expect(result.checkpointedOmObservationReflectionBatchTokens).toBe(50);
    expect(result.checkpointedOmObservationSupportTokens).toBe(200);
    expect(result.checkpointedOmReflectionSupportTokens).toBe(150);
  });

  it('maps LTM settings', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.ltmRecallScoreThreshold).toBe(0.7);
    expect(result.ltmRecallDocumentCount).toBe(10);
  });

  it('maps role fields when present', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.roleName).toBe('Developer');
    expect(result.roleDescription).toBe('Writes code');
  });

  it('maps workspace fields from agent', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.workspaceFilesystem).toBe('host');
    expect(result.workspaceSandbox).toBe(false);
    expect(result.workspaceSkills).toEqual(['skill-1', 'skill-2']);
  });

  it('maps workspace base path from loader config', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.workspaceBasePath).toBe('/workspace');
  });

  it('maps tools from toolset', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.tools).toEqual([{ name: 'tool-1' }, { name: 'tool-2' }]);
  });

  it('maps providers from runtime data', () => {
    const result = buildAgentRuntimeConfig(mockLoaderConfig, mockRuntimeData, mockToolset);

    expect(result.providers).toEqual([]);
  });

  it('handles missing optional agent fields as undefined', () => {
    const dataWithoutOptionals = {
      ...mockRuntimeData,
      agent: {
        ...mockRuntimeData.agent,
        description: undefined,
        workspaceFilesystem: undefined,
        workspaceSandbox: undefined,
        workspaceSkills: undefined,
        workspaceEmbedder: undefined,
      },
    };

    const result = buildAgentRuntimeConfig(mockLoaderConfig, dataWithoutOptionals, mockToolset);

    expect(result.description).toBeUndefined();
    expect(result.workspaceFilesystem).toBeUndefined();
    expect(result.workspaceSandbox).toBeUndefined();
    expect(result.workspaceSkills).toBeUndefined();
  });

  it('handles missing role as undefined', () => {
    const dataWithoutRole = {
      ...mockRuntimeData,
      role: undefined,
    };

    const result = buildAgentRuntimeConfig(mockLoaderConfig, dataWithoutRole, mockToolset);

    expect(result.roleName).toBeUndefined();
    expect(result.roleDescription).toBeUndefined();
  });
});
