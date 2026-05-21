import { describe, expect, it, vi } from 'vitest';
import type { AgentLoaderConfig } from './agent-loader-types';
import { loadAgentToolset } from './agent-loader-tools';

// ─── Mock refs via vi.hoisted so tests can call .mock* on them ────────────────
const {
  mockMicroErpTools,
  mockSkillsTools,
  mockCreateMicroErpTools,
  mockCreateSkillsTools,
  mockCreateNotificationTools,
  mockCreateGitHubTools,
  mockCreateCoolifyTools,
  mockCreateScheduleTools,
  mockCreateCapabilityTools,
  mockCreateInternalChatTools,
  mockCreateMiniMaxTools,
  mockCreateInternalAgentTools,
} = vi.hoisted(() => {
  const mockMicroErpTools = { listContracts: vi.fn(), listInvoices: vi.fn() };
  const mockSkillsTools = { listAgentSkills: vi.fn(), installAgentSkill: vi.fn() };
  const mockCreateMicroErpTools = vi.fn(() => mockMicroErpTools);
  const mockCreateSkillsTools = vi.fn(() => mockSkillsTools);
  const mockCreateNotificationTools = vi.fn(() => ({ notify: vi.fn() }));
  const mockCreateGitHubTools = vi.fn(() => ({ getIssue: vi.fn() }));
  const mockCreateCoolifyTools = vi.fn(() => ({ listServers: vi.fn() }));
  const mockCreateScheduleTools = vi.fn(() => ({ listSchedules: vi.fn() }));
  const mockCreateCapabilityTools = vi.fn(() => ({ listCapabilities: vi.fn() }));
  const mockCreateInternalChatTools = vi.fn(() => ({ sendMessage: vi.fn() }));
  const mockCreateMiniMaxTools = vi.fn(() => ({ generateSpeech: vi.fn() }));
  const mockCreateInternalAgentTools = vi.fn(() => ({ hireAgent: vi.fn() }));
  return {
    mockMicroErpTools,
    mockSkillsTools,
    mockCreateMicroErpTools,
    mockCreateSkillsTools,
    mockCreateNotificationTools,
    mockCreateGitHubTools,
    mockCreateCoolifyTools,
    mockCreateScheduleTools,
    mockCreateCapabilityTools,
    mockCreateInternalChatTools,
    mockCreateMiniMaxTools,
    mockCreateInternalAgentTools,
  };
});

// ─── Mock creators ─────────────────────────────────────────────────────────────
vi.mock('../micro-erp/tools', () => ({
  createMicroErpTools: mockCreateMicroErpTools,
}));
vi.mock('./skills-tools', () => ({
  createAgentSkillTools: mockCreateSkillsTools,
}));
vi.mock('../notifications/tools', () => ({
  createAgentNotificationTools: mockCreateNotificationTools,
}));
vi.mock('../github/tools', () => ({
  createGitHubTools: mockCreateGitHubTools,
}));
vi.mock('../coolify/tools', () => ({
  createCoolifyTools: mockCreateCoolifyTools,
}));
vi.mock('../schedules/tools', () => ({
  createAgentScheduleTools: mockCreateScheduleTools,
}));
vi.mock('../capabilities/tools', () => ({
  createCapabilityTools: mockCreateCapabilityTools,
}));
vi.mock('../communication/internal-chat-tools', () => ({
  createInternalChatTools: mockCreateInternalChatTools,
}));
vi.mock('../minimax/tools', () => ({
  createMiniMaxTools: mockCreateMiniMaxTools,
}));
vi.mock('./internal-agent-tools', () => ({
  createInternalAgentTools: mockCreateInternalAgentTools,
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────
const MOCK_DB = {} as any;
const MOCK_AGENT_ID = 'agent-123';
const MOCK_AGENT_NAME = 'Test Agent';
const MOCK_ALLOWED_TOOL_IDS = new Set<string>();

function makeConfig(overrides: any = {}): any {
  return {
    githubApps: [],
    coolify: undefined,
    schedules: { maxSchedules: 10 },
    internalChat: { maxParticipants: 20 },
    minimax: undefined,
    workspaceBasePath: '/workspace',
    emailMailboxes: [],
    ...overrides,
  };
}

// ─── loadAgentToolset ─────────────────────────────────────────────────────────
describe('loadAgentToolset', () => {
  it('returns tools merged from all enabled creator modules', async () => {
    const config = makeConfig({ coolify: { apiUrl: 'http://localhost', apiKey: 'k' } });
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.tools.listContracts).toBeDefined(); // microErp
    expect(result.tools.notify).toBeDefined(); // notifications
    expect(result.tools.getIssue).toBeDefined(); // github
    expect(result.tools.listServers).toBeDefined(); // coolify
    expect(result.tools.listSchedules).toBeDefined(); // schedules
    expect(result.tools.listCapabilities).toBeDefined(); // capabilities
    expect(result.tools.sendMessage).toBeDefined(); // internalChat
    expect(result.tools.listAgentSkills).toBeDefined(); // skills
    expect(result.tools.hireAgent).toBeDefined(); // internalAgents
    // minimax disabled
    expect(result.tools.generateSpeech).toBeUndefined();
  });

  it('includes minimax tools when minimax config is provided', async () => {
    const config = makeConfig({ minimax: { groupId: 'g', apiKey: 'k' } });
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.tools.generateSpeech).toBeDefined();
  });

  it('excludes minimax tools when minimax config is absent', async () => {
    const config = makeConfig({ minimax: undefined });
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.tools.generateSpeech).toBeUndefined();
  });

  it('excludes coolify tools when coolify config is absent', async () => {
    const config = makeConfig({ coolify: undefined });
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.tools.listServers).toBeUndefined();
  });

  it('passes db and allowedToolIds to createMicroErpTools', async () => {
    mockCreateMicroErpTools.mockClear();
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: makeConfig(),
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateMicroErpTools).toHaveBeenCalledWith(MOCK_DB, MOCK_ALLOWED_TOOL_IDS);
  });

  it('passes agentId, agentName, internalChat config, and allowedToolIds to createInternalChatTools', async () => {
    mockCreateInternalChatTools.mockClear();
    const config: any = makeConfig({ internalChat: { maxParticipants: 99 } });
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateInternalChatTools).toHaveBeenCalledWith(
      MOCK_AGENT_ID,
      MOCK_AGENT_NAME,
      config.internalChat,
      MOCK_ALLOWED_TOOL_IDS,
    );
  });

  it('passes agentId, githubApps, and allowedToolIds to createGitHubTools', async () => {
    mockCreateGitHubTools.mockClear();
    const config: any = makeConfig({
      githubApps: [{ appId: 1, privateKey: 'pk', webhookSecret: 'ws' }],
    });
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateGitHubTools).toHaveBeenCalledWith(
      MOCK_AGENT_ID,
      config.githubApps,
      MOCK_ALLOWED_TOOL_IDS,
    );
  });

  it('passes coolify config and allowedToolIds to createCoolifyTools when set', async () => {
    mockCreateCoolifyTools.mockClear();
    const config = makeConfig({ coolify: { apiUrl: 'http://localhost', apiKey: 'k' } });
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateCoolifyTools).toHaveBeenCalledWith(config.coolify, MOCK_ALLOWED_TOOL_IDS);
  });

  it('passes minimax config and allowedToolIds to createMiniMaxTools when set', async () => {
    mockCreateMiniMaxTools.mockClear();
    const config = makeConfig({ minimax: { groupId: 'g', apiKey: 'k' } });
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateMiniMaxTools).toHaveBeenCalledWith(config.minimax, MOCK_ALLOWED_TOOL_IDS);
  });

  it('returns correct breakdown with all tools enabled', async () => {
    const config = makeConfig({
      coolify: { apiUrl: 'http://localhost', apiKey: 'k' },
      minimax: { groupId: 'g', apiKey: 'k' },
    });
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.breakdown.microErp).toBe(2);
    expect(result.breakdown.notifications).toBe(1);
    expect(result.breakdown.github).toBe(1);
    expect(result.breakdown.coolify).toBe(1);
    expect(result.breakdown.schedules).toBe(1);
    expect(result.breakdown.capabilities).toBe(1);
    expect(result.breakdown.internalChat).toBe(1);
    expect(result.breakdown.minimax).toBe(1);
    expect(result.breakdown.skills).toBe(2);
    expect(result.breakdown.internalAgents).toBe(1);
    expect(result.breakdown.mcp).toBe(0);
    expect(result.breakdown.total).toBe(12);
  });

  it('returns breakdown with minimax and coolify 0 when not configured', async () => {
    const config = makeConfig();
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.breakdown.minimax).toBe(0);
    expect(result.breakdown.coolify).toBe(0);
    expect(result.breakdown.total).toBe(10);
  });

  it('returns breakdown with mcp: 0 regardless of configuration', async () => {
    const config = makeConfig();
    const result = await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: config,
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(result.breakdown.mcp).toBe(0);
  });

  it('does not call createCoolifyTools when coolify is undefined', async () => {
    mockCreateCoolifyTools.mockClear();
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: makeConfig({ coolify: undefined }),
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateCoolifyTools).not.toHaveBeenCalled();
  });

  it('does not call createMiniMaxTools when minimax is undefined', async () => {
    mockCreateMiniMaxTools.mockClear();
    await loadAgentToolset({
      db: MOCK_DB,
      loaderConfig: makeConfig({ minimax: undefined }),
      agentId: MOCK_AGENT_ID,
      agentName: MOCK_AGENT_NAME,
      allowedToolIds: MOCK_ALLOWED_TOOL_IDS,
    });

    expect(mockCreateMiniMaxTools).not.toHaveBeenCalled();
  });
});
