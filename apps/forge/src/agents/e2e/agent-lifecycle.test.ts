/**
 * E2E tests for agent lifecycle — hire, configure, terminate.
 *
 * Integration-style vitest tests with mocked external dependencies.
 * Tests the highest-level agent lifecycle functions:
 *   runInternalHiring, terminateInternalAgent
 *
 * Uses vi.hoisted() for mocks that need to be shared with dynamic imports,
 * avoiding hoisting conflicts between vi.mock() and dynamic import() calls.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── vi.hoisted mocks — hoisted above imports so dynamic imports get them ──
const { mockHireInternalAgent, mockGenerateHiredAgentInstructions, mockBuildHiredAgentProfile } = vi.hoisted(() => ({
  mockHireInternalAgent: vi.fn().mockResolvedValue({ agentId: 'generated-id' }),
  mockGenerateHiredAgentInstructions: vi.fn().mockResolvedValue({
    valid: true,
    agentName: 'Test Agent',
    agentDescription: 'Test description',
    roleId: 'role-devops',
    roleName: 'DevOps Engineer',
    roleDescription: 'Manages CI/CD',
    instructions: 'Run CI/CD pipelines',
    costUsd: 0.05,
  }),
  mockBuildHiredAgentProfile: vi.fn().mockResolvedValue({
    name: 'Test Agent',
    description: 'Test description',
    modelProfileId: 'profile-1',
    omModelProfileId: 'om-profile-1',
  }),
}));

// ── Mock @forge-runtime/core before anything else ───────────────────────────
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  oauthStore: vi.fn(),
  syncAnthropicCredential: vi.fn(),
  syncOpenAICodexCredential: vi.fn(),
  LibsqlConversationStore: vi.fn(),
  toMastraSafeIdentifier: vi.fn((s: string) => s.replace(/[^a-z0-9]/gi, '-').slice(0, 64)),
  createTool: vi.fn(),
  runNativeToolLoop: vi.fn(),
}));

vi.mock('@forge-runtime/core/memory', () => ({}));

// ── Mock agent-runner (registry doesn't crash when we add a loaded agent) ──
vi.mock('../agent-runner', () => ({
  createAgentRunner: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({ wake: { events: [] }, pendingRunEvents: [] }),
  })),
}));

// ── Mock agent-loader ───────────────────────────────────────────────────────
vi.mock('../agent-loader', () => ({
  loadAgent: vi.fn().mockResolvedValue({
    agentId: 'agent-new',
    name: 'Test Agent',
    description: 'Test description',
    dispose: vi.fn(),
  }),
}));

// ── Mock utils ─────────────────────────────────────────────────────────────
vi.mock('../../utils/id', () => ({ createId: vi.fn().mockReturnValue('generated-id') }));
vi.mock('../../encryption/crypto', () => ({ encryptSecret: vi.fn().mockReturnValue('encrypted-value') }));

// ── Mock hire-agent with hoisted mock ─────────────────────────────────────
vi.mock('../hire-agent', () => ({
  hireInternalAgent: mockHireInternalAgent,
}));

// ── Mock hire sub-functions that run LLM code ──────────────────────────────
vi.mock('../hiring-requests-handler', () => ({
  generateHiredAgentInstructions: mockGenerateHiredAgentInstructions,
}));

vi.mock('../hiring-profile', () => ({
  buildHiredAgentProfile: mockBuildHiredAgentProfile,
}));

// ── Mock other shared infrastructure ──────────────────────────────────────
vi.mock('../llm/settings-store', () => ({
  createLlmSettingsStore: vi.fn().mockReturnValue({
    getResolvedDefaults: vi.fn().mockResolvedValue({
      primaryProfile: { profileId: 'profile-1', modelKey: 'claude-3-5-sonnet' },
      omProfile: { profileId: 'om-profile-1', modelKey: 'claude-3-5-sonnet' },
      hiringRhProfile: { profileId: 'hiring-rh-profile', modelKey: 'claude-3-5-sonnet' },
    }),
    listProfiles: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../capabilities/store', () => ({
  createCapabilityStore: vi.fn().mockReturnValue({ listTools: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: vi.fn().mockReturnValue({
    getSettings: vi.fn().mockResolvedValue({ companyName: 'Test Company', companyContext: 'Test context' }),
  }),
}));

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn().mockReturnValue({
    recordCashIn: vi.fn().mockResolvedValue(undefined),
    recordCashOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn().mockReturnValue({ recordCashOut: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('../capabilities/tools', () => ({ createCapabilityTools: vi.fn().mockReturnValue([]) }));
vi.mock('../capabilities/catalog', () => ({ forgeCustomToolIds: new Set() }));

vi.mock('../llm/runtime-model', () => ({
  resolveProfileRuntimeModel: vi.fn().mockResolvedValue({
    modelKey: 'claude-3-5-sonnet',
    baseUrl: null,
    apiKey: 'test-key',
  }),
}));

vi.mock('../hiring-prompt', () => ({
  buildHiringPrompt: vi.fn().mockReturnValue('mocked prompt'),
  estimateTextTokens: vi.fn().mockReturnValue(100),
}));

vi.mock('../hiring-validators', () => ({
  normalizeAgentName: vi.fn((s: string) => s.trim()),
  validateGeneratedAgentProfile: vi.fn().mockReturnValue({ valid: true }),
  isToolResultWithOutput: vi.fn().mockReturnValue(false),
  validateHireAgentInput: vi.fn().mockReturnValue({ valid: true }),
}));

// ── Imports after all mocks ────────────────────────────────────────────────
import { runInternalHiring } from '../internal-agent-lifecycle';
import { terminateInternalAgent } from '../terminate-agent';

// ─────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────

function makeMockDb(agentOverrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }) };
      return fn(tx);
    }),
    query: {
      agents: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    ...agentOverrides,
  } as unknown as Parameters<typeof terminateInternalAgent>[0];
}

function makeMockGitHubApps() {
  return {
    isConfigured: vi.fn().mockResolvedValue(true),
    createAgentApp: vi.fn().mockResolvedValue({ appId: 'app-123', appName: 'test-app' }),
    deleteAgentApp: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockEmail() {
  return {
    isConfigured: vi.fn().mockResolvedValue(true),
    provisionMailbox: vi.fn().mockResolvedValue({
      credentials: { type: 'email', address: 'test@test.com', token: 'token-123' },
    }),
    deleteAgentMailbox: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockCoolify() {
  return { isConfigured: vi.fn().mockResolvedValue(false) };
}

function makeMockSchedules() {
  return {
    createHeartbeatSchedule: vi.fn().mockResolvedValue(undefined),
    removeAgent: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockInternalChat() {
  return {
    registerAgentAccount: vi.fn().mockResolvedValue({ accountId: 'chat-acc-1' }),
    deleteAgentAccount: vi.fn().mockResolvedValue(undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tests — runInternalHiring
// ─────────────────────────────────────────────────────────────────────────

describe('agent lifecycle — hire', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('passes hire request to generateHiredAgentInstructions', async () => {
    await runInternalHiring(makeMockDb() as never, {
      hiringRequest: 'Hire a DevOps agent to manage CI/CD pipelines.',
      additionalContext: 'We use GitHub Actions.',
      weeklyBudgetUsd: 50,
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: makeMockEmail() as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(mockGenerateHiredAgentInstructions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hiringRequest: 'Hire a DevOps agent to manage CI/CD pipelines.',
        additionalContext: 'We use GitHub Actions.',
      }),
    );
  });

  it('passes agentName from generateHiredAgentInstructions to buildHiredAgentProfile', async () => {
    await runInternalHiring(makeMockDb() as never, {
      hiringRequest: 'Hire a data agent.',
      weeklyBudgetUsd: 75,
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: makeMockEmail() as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(mockBuildHiredAgentProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agentName: 'Test Agent' }),
    );
  });

  it('passes internalChat service through to hireInternalAgent', async () => {
    const internalChat = makeMockInternalChat();
    const db = makeMockDb();

    await runInternalHiring(db as never, {
      hiringRequest: 'Hire a chat agent.',
      weeklyBudgetUsd: 40,
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: makeMockEmail() as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: internalChat as never,
    });

    expect(mockHireInternalAgent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ internalChat }),
    );
  });

  it('passes githubApps through to hireInternalAgent', async () => {
    const githubApps = makeMockGitHubApps();
    const db = makeMockDb();

    await runInternalHiring(db as never, {
      hiringRequest: 'Hire a github agent.',
      weeklyBudgetUsd: 60,
      workspaceBasePath: '/workspace',
      githubApps: githubApps as never,
      emailMailboxes: makeMockEmail() as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(mockHireInternalAgent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ githubApps }),
    );
  });

  it('skips email provisioning when email is not configured', async () => {
    const emailMailboxes = {
      isConfigured: vi.fn().mockResolvedValue(false),
      provisionMailbox: vi.fn(),
    };

    await runInternalHiring(makeMockDb() as never, {
      hiringRequest: 'Hire a minimal agent.',
      weeklyBudgetUsd: 25,
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: emailMailboxes as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(emailMailboxes.provisionMailbox).not.toHaveBeenCalled();
  });

  it('skips GitHub app creation when GitHub is not configured', async () => {
    const githubApps = { isConfigured: vi.fn().mockResolvedValue(false), createAgentApp: vi.fn() };

    await runInternalHiring(makeMockDb() as never, {
      hiringRequest: 'Hire a local agent.',
      weeklyBudgetUsd: 20,
      workspaceBasePath: '/workspace',
      githubApps: githubApps as never,
      emailMailboxes: null as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(githubApps.createAgentApp).not.toHaveBeenCalled();
  });

  it('returns an agentId from hireInternalAgent', async () => {
    const result = await runInternalHiring(makeMockDb() as never, {
      hiringRequest: 'Hire a test agent.',
      weeklyBudgetUsd: 50,
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: makeMockEmail() as never,
      coolify: makeMockCoolify() as never,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(result).toHaveProperty('agentId');
    expect(typeof result.agentId).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tests — terminateInternalAgent
// ─────────────────────────────────────────────────────────────────────────

describe('agent lifecycle — terminate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws when agent does not exist', async () => {
    const mockDb = { query: { agents: { findFirst: vi.fn().mockResolvedValue(null) } } };

    await expect(
      terminateInternalAgent(mockDb as never, {
        agentId: 'nonexistent-id',
        workspaceBasePath: '/workspace',
        githubApps: makeMockGitHubApps() as never,
        emailMailboxes: null,
        coolify: null,
        schedules: makeMockSchedules() as never,
        internalChat: makeMockInternalChat() as never,
      }),
    ).rejects.toThrow('Agent not found: nonexistent-id');
  });

  it('removes agent from schedule manager', async () => {
    const schedules = makeMockSchedules();
    const mockDb = {
      query: { agents: { findFirst: vi.fn().mockResolvedValue({ id: 'agent-1', name: 'Test', executionState: 'running' }) } },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };

    await terminateInternalAgent(mockDb as never, {
      agentId: 'agent-1',
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: null,
      coolify: null,
      schedules: schedules as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(schedules.removeAgent).toHaveBeenCalledWith('agent-1');
  });

  it('deletes GitHub app when GitHub is configured', async () => {
    const githubApps = makeMockGitHubApps();
    const mockDb = {
      query: { agents: { findFirst: vi.fn().mockResolvedValue({ id: 'agent-gh', name: 'GH Agent', executionState: 'idle' }) } },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };

    await terminateInternalAgent(mockDb as never, {
      agentId: 'agent-gh',
      workspaceBasePath: '/workspace',
      githubApps: githubApps as never,
      emailMailboxes: null,
      coolify: null,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(githubApps.deleteAgentApp).toHaveBeenCalledWith('agent-gh');
  });

  it('deletes email mailbox when email is configured', async () => {
    const emailMailboxes = makeMockEmail();
    const mockDb = {
      query: { agents: { findFirst: vi.fn().mockResolvedValue({ id: 'agent-email', name: 'Email Agent', executionState: 'idle' }) } },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };

    await terminateInternalAgent(mockDb as never, {
      agentId: 'agent-email',
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: emailMailboxes as never,
      coolify: null,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(emailMailboxes.deleteAgentMailbox).toHaveBeenCalledWith('agent-email');
  });

  it('deletes internal chat account for the agent', async () => {
    const internalChat = makeMockInternalChat();
    const mockDb = {
      query: { agents: { findFirst: vi.fn().mockResolvedValue({ id: 'agent-chat', name: 'Chat Agent', executionState: 'idle' }) } },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };

    await terminateInternalAgent(mockDb as never, {
      agentId: 'agent-chat',
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: null,
      coolify: null,
      schedules: makeMockSchedules() as never,
      internalChat: internalChat as never,
    });

    expect(internalChat.deleteAgentAccount).toHaveBeenCalledWith({ agentId: 'agent-chat' });
  });

  it('continues terminate flow when internal chat deletion fails (non-fatal)', async () => {
    const internalChat = {
      ...makeMockInternalChat(),
      deleteAgentAccount: vi.fn().mockRejectedValue(new Error('chat service unavailable')),
    };
    const mockDb = {
      query: { agents: { findFirst: vi.fn().mockResolvedValue({ id: 'agent-chat-fail', name: 'Fail Agent', executionState: 'idle' }) } },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };

    await expect(
      terminateInternalAgent(mockDb as never, {
        agentId: 'agent-chat-fail',
        workspaceBasePath: '/workspace',
        githubApps: makeMockGitHubApps() as never,
        emailMailboxes: null,
        coolify: null,
        schedules: makeMockSchedules() as never,
        internalChat: internalChat as never,
      }),
    ).resolves.not.toThrow();
  });

  it('deletes agent execution contracts and agent record', async () => {
    const mockDb = {
      query: { agents: { findFirst: vi.fn().mockResolvedValue({ id: 'agent-del', name: 'Del Agent', executionState: 'idle' }) } },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };

    await terminateInternalAgent(mockDb as never, {
      agentId: 'agent-del',
      workspaceBasePath: '/workspace',
      githubApps: makeMockGitHubApps() as never,
      emailMailboxes: null,
      coolify: null,
      schedules: makeMockSchedules() as never,
      internalChat: makeMockInternalChat() as never,
    });

    expect(mockDb.delete).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tests — full lifecycle integration
// ─────────────────────────────────────────────────────────────────────────

describe('agent lifecycle — full integration', () => {
  it('hire then terminate: agent flows through the full lifecycle', async () => {
    const githubApps = makeMockGitHubApps();
    const emailMailboxes = makeMockEmail();
    const schedules = makeMockSchedules();
    const internalChat = makeMockInternalChat();
    const db = makeMockDb();

    // Re-configure hire mock to trigger the internalChat side effect for assertions
    mockHireInternalAgent.mockImplementation(async (_d: unknown, input: Record<string, unknown>) => {
      const ic = input['internalChat'] as typeof internalChat;
      if (ic?.registerAgentAccount) await (ic as typeof internalChat).registerAgentAccount({ agentId: 'generated-id' });
      return { agentId: 'generated-id' };
    });

    // Step 1: Hire
    const hired = await runInternalHiring(db as never, {
      hiringRequest: 'Hire a full lifecycle test agent.',
      weeklyBudgetUsd: 90,
      workspaceBasePath: '/workspace',
      githubApps: githubApps as never,
      emailMailboxes: emailMailboxes as never,
      coolify: makeMockCoolify() as never,
      schedules: schedules as never,
      internalChat: internalChat as never,
    });

    expect(hired).toHaveProperty('agentId');
    expect(internalChat.registerAgentAccount).toHaveBeenCalled();

    // Step 2: Terminate the same agent
    db.query.agents.findFirst.mockResolvedValueOnce({
      id: hired.agentId,
      name: 'Full Lifecycle Agent',
      roleId: 'role-full',
      weeklyBudgetUsd: 90,
      executionState: 'idle',
    });

    await terminateInternalAgent(db as never, {
      agentId: hired.agentId,
      workspaceBasePath: '/workspace',
      githubApps: githubApps as never,
      emailMailboxes: emailMailboxes as never,
      coolify: null,
      schedules: schedules as never,
      internalChat: internalChat as never,
    });

    // Verify terminate cleaned up
    expect(schedules.removeAgent).toHaveBeenCalledWith(hired.agentId);
    expect(internalChat.deleteAgentAccount).toHaveBeenCalledWith({ agentId: hired.agentId });
    expect(githubApps.deleteAgentApp).toHaveBeenCalledWith(hired.agentId);
  });
});