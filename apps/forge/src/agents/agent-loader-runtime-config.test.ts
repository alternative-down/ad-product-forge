import { describe, expect, it } from 'vitest';
import { buildAgentRuntimeConfig } from './agent-loader-runtime-config';

const makeMinimalRuntimeData = () => ({
  agent: {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'A test agent',
    instructions: 'You are helpful',
    workspaceFilesystem: undefined,
    workspaceSandbox: undefined,
    workspaceSkills: undefined,
    workspaceEmbedder: undefined,
  },
  primaryRuntimeModel: 'gpt-4o',
  primaryProfile: { profileId: 'profile-1', modelKey: 'gpt-4o' },
  omRuntimeModel: undefined,
  omProfile: { profileId: 'om-profile-1', modelKey: 'gpt-4o-mini' },
  companySettings: {
    companyName: 'Acme',
    companyContext: 'Testing context',
    communicationDmFlushingEnabled: true,
    communicationGroupFlushingEnabled: false,
    memoryLastMessagesFullEnabled: false,
    memoryLastMessagesCount: 20,
    tokenCountFilterEnabled: true,
    tokenCountFilterLimit: 4096,
    checkpointedOmEnabled: true,
    checkpointedOmTotalContextTokens: 100000,
    checkpointedOmRecentRawTokens: 20000,
    checkpointedOmRawObservationBatchTokens: 5000,
    checkpointedOmObservationReflectionBatchTokens: 2000,
    checkpointedOmObservationSupportTokens: 3000,
    checkpointedOmReflectionSupportTokens: 2000,
    ltmRecallScoreThreshold: 0.7,
    ltmRecallDocumentCount: 5,
  },
  role: {
    id: 'role-1',
    name: 'Developer',
    description: 'A developer agent',
  },
  providers: [],
  capabilitySet: { toolIds: ['list_contacts', 'upsert_contact'] },
});

const makeLoaderConfig = () => ({
  workspaceBasePath: '/workspace',
  githubApps: [],
  emailMailboxes: [],
  coolify: undefined,
  minimax: undefined,
  schedules: undefined,
  internalChat: {} as never,
});

describe('buildAgentRuntimeConfig', () => {
  it('maps basic agent fields', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.id).toBe('agent-1');
    expect(result.name).toBe('Test Agent');
    expect(result.description).toBe('A test agent');
    expect(result.instructions).toBe('You are helpful');
  });

  it('maps model and pricing fields', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.model).toBe('gpt-4o');
    expect(result.pricingModelKey).toBe('gpt-4o');
    expect(result.modelProfileId).toBe('profile-1');
    expect(result.omModel).toBeUndefined();
    expect(result.omPricingModelKey).toBe('gpt-4o-mini');
    expect(result.omModelProfileId).toBe('om-profile-1');
  });

  it('maps company settings fields', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.companyName).toBe('Acme');
    expect(result.companyContext).toBe('Testing context');
    expect(result.communicationDmFlushingEnabled).toBe(true);
    expect(result.communicationGroupFlushingEnabled).toBe(false);
    expect(result.memoryLastMessagesFullEnabled).toBe(false);
    expect(result.memoryLastMessagesCount).toBe(20);
    expect(result.tokenCountFilterEnabled).toBe(true);
    expect(result.tokenCountFilterLimit).toBe(4096);
  });

  it('maps checkpointed om settings', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.checkpointedOmEnabled).toBe(true);
    expect(result.checkpointedOmTotalContextTokens).toBe(100000);
    expect(result.checkpointedOmRecentRawTokens).toBe(20000);
    expect(result.checkpointedOmRawObservationBatchTokens).toBe(5000);
    expect(result.checkpointedOmObservationReflectionBatchTokens).toBe(2000);
    expect(result.checkpointedOmObservationSupportTokens).toBe(3000);
    expect(result.checkpointedOmReflectionSupportTokens).toBe(2000);
  });

  it('maps ltm settings', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.ltmRecallScoreThreshold).toBe(0.7);
    expect(result.ltmRecallDocumentCount).toBe(5);
  });

  it('maps role fields', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.roleName).toBe('Developer');
    expect(result.roleDescription).toBe('A developer agent');
  });

  it('passes tools and workspaceBasePath through', () => {
    const runtimeData = makeMinimalRuntimeData();
    const loaderConfig = makeLoaderConfig();
    const toolset = { tools: [{ id: 'tool-1' }], breakdown: { custom: 1 } };

    const result = buildAgentRuntimeConfig(loaderConfig as any, runtimeData as any, toolset as any);

    expect(result.tools).toEqual([{ id: 'tool-1' }]);
    expect(result.workspaceBasePath).toBe('/workspace');
  });

  it('maps workspace fields from agent when present', () => {
    const runtimeData = makeMinimalRuntimeData();
    runtimeData.agent.workspaceFilesystem = { type: 's3', bucket: 'test' } as never;
    runtimeData.agent.workspaceSandbox = { type: 'docker' } as never;
    runtimeData.agent.workspaceSkills = { enabled: true } as never;
    runtimeData.agent.workspaceEmbedder = 'embedder-1' as never;
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.workspaceFilesystem).toEqual({ type: 's3', bucket: 'test' });
    expect(result.workspaceSandbox).toEqual({ type: 'docker' });
    expect(result.workspaceSkills).toEqual({ enabled: true });
    expect(result.workspaceEmbedder).toBe('embedder-1');
  });

  it('maps providers from runtime data', () => {
    const runtimeData = makeMinimalRuntimeData();
    runtimeData.providers = [{ type: 'github' }] as never;
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.providers).toEqual([{ type: 'github' }]);
  });

  it('handles missing description', () => {
    const runtimeData = makeMinimalRuntimeData();
    (runtimeData.agent as any).description = undefined;
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.description).toBeUndefined();
  });

  it('handles missing role', () => {
    const runtimeData = makeMinimalRuntimeData();
    (runtimeData as any).role = undefined;
    const loaderConfig = makeLoaderConfig();

    const result = buildAgentRuntimeConfig(
      loaderConfig as any,
      runtimeData as any,
      { tools: [], breakdown: {} } as any,
    );

    expect(result.roleName).toBeUndefined();
    expect(result.roleDescription).toBeUndefined();
  });
});
