import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockBuildHiredAgentProfile, mockGenerateHiredAgentInstructions, mockHireInternalAgent, mockTerminateInternalAgent, mockCreateCompanyCashOperations, mockRecordCashOut, mockCreateAgentApp, mockIsConfigured } = vi.hoisted(() => {
  const mockRecordCashOut = vi.fn().mockResolvedValue(undefined);
  return {
    mockBuildHiredAgentProfile: vi.fn().mockResolvedValue({
      name: 'Test Agent',
      description: 'A test agent',
      slug: 'test-agent',
      identity: { roleCore: 'Tester', operatingPrinciples: 'Test', nonNegotiables: 'Quality' },
      domain: { scope: 'forge', activities: 'testing', boundaries: '/test' },
      direction: { currentMission: 'test mission', successDefinition: 'pass' },
    }),
    mockGenerateHiredAgentInstructions: vi.fn().mockResolvedValue({
      valid: true,
      agentName: 'Test Agent',
      agentDescription: 'A test agent',
      roleId: 'role-1',
      roleName: 'Tester',
      roleDescription: 'Test role',
      instructions: 'Test instructions',
      costUsd: 50,
    }),
    mockHireInternalAgent: vi.fn().mockResolvedValue({
      agentId: 'agent-new',
      emailAddress: 'test@example.com',
    }),
    mockTerminateInternalAgent: vi.fn().mockResolvedValue(undefined),
    mockRecordCashOut,
    mockCreateCompanyCashOperations: vi.fn().mockReturnValue({
      recordCashOut: mockRecordCashOut,
    }),
    mockCreateAgentApp: vi.fn().mockResolvedValue({ registrationUrl: 'https://github.com/apps/test' }),
    mockIsConfigured: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('./hiring-profile', () => ({
  buildHiredAgentProfile: mockBuildHiredAgentProfile,
}));

vi.mock('./hiring-rh', () => ({
  generateHiredAgentInstructions: mockGenerateHiredAgentInstructions,
}));

vi.mock('./hire-agent', () => ({
  hireInternalAgent: mockHireInternalAgent,
}));

vi.mock('./terminate-agent', () => ({
  terminateInternalAgent: mockTerminateInternalAgent,
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: mockCreateCompanyCashOperations,
}));

vi.mock('../github/manager', () => ({
  GitHubAppManager: vi.fn().mockImplementation(() => ({
    isConfigured: mockIsConfigured,
    createAgentApp: mockCreateAgentApp,
  })),
}));

import { runInternalHiring, runInternalTermination } from './internal-agent-lifecycle';
import type { Database } from '../database/index';

const mockDb = {} as Database;

function createMockSchedules() {
  return {
    createAgentSchedule: vi.fn(),
    removeAgent: vi.fn(),
    listAgentSchedules: vi.fn(),
  };
}

function createMockInternalChat() {
  return {
    getOrCreateConversation: vi.fn(),
    sendMessage: vi.fn(),
    listConversations: vi.fn(),
    markMessagesRead: vi.fn(),
  };
}

function createMockGitHubApps() {
  return {
    isConfigured: mockIsConfigured,
    createAgentApp: mockCreateAgentApp,
  };
}

function makeInput(overrides?: Partial<Parameters<typeof runInternalHiring>[1]>) {
  return {
    hiringRequest: 'Hire a test agent',
    weeklyBudgetUsd: 100,
    workspaceBasePath: '/ws',
    githubApps: createMockGitHubApps() as any,
    emailMailboxes: null,
    coolify: null,
    schedules: createMockSchedules() as any,
    internalChat: createMockInternalChat() as any,
    ...overrides,
  };
}

function resetToValidHiringRh() {
  mockGenerateHiredAgentInstructions.mockResolvedValue({
    valid: true,
    agentName: 'Test Agent',
    agentDescription: 'A test agent',
    roleId: 'role-1',
    roleName: 'Tester',
    roleDescription: 'Test role',
    instructions: 'Test instructions',
    costUsd: 50,
  });
}

describe('runInternalHiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToValidHiringRh();
    mockIsConfigured.mockResolvedValue(true);
    mockCreateAgentApp.mockResolvedValue({ registrationUrl: 'https://github.com/apps/test' });
  });

  it('generates hiring instructions and hires agent', async () => {
    const result = await runInternalHiring(mockDb, makeInput());

    expect(mockGenerateHiredAgentInstructions).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      hiringRequest: 'Hire a test agent',
    }));
    expect(mockBuildHiredAgentProfile).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      agentName: 'Test Agent',
      agentDescription: 'A test agent',
    }));
    expect(result.agentId).toBe('agent-new');
  });

  it('records cash out for hiring workflow cost', async () => {
    await runInternalHiring(mockDb, makeInput());

    expect(mockRecordCashOut).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent-hiring-process',
      amountUsd: 50,
      referenceType: 'hiring-workflow',
    }));
  });

  it('creates GitHub app when GitHub is configured', async () => {
    await runInternalHiring(mockDb, makeInput());

    expect(mockCreateAgentApp).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-new',
      agentName: 'Test Agent',
    }));
  });

  it('returns registration URL from GitHub app', async () => {
    const result = await runInternalHiring(mockDb, makeInput());

    expect(result.githubAppRegistrationUrl).toBe('https://github.com/apps/test');
  });

  it('skips GitHub app creation when GitHub is not configured', async () => {
    mockIsConfigured.mockResolvedValue(false);
    mockCreateAgentApp.mockResolvedValue(null);

    await runInternalHiring(mockDb, makeInput());

    expect(mockCreateAgentApp).not.toHaveBeenCalled();
  });

  it('throws when hiring instructions are invalid', async () => {
    mockGenerateHiredAgentInstructions.mockResolvedValue({
      valid: false,
      error: 'Invalid hiring request',
    });

    await expect(runInternalHiring(mockDb, makeInput())).rejects.toThrow('Invalid hiring request');
  });

  it('terminates agent if GitHub app creation fails', async () => {
    mockCreateAgentApp.mockRejectedValue(new Error('GitHub API error'));

    await expect(runInternalHiring(mockDb, makeInput())).rejects.toThrow('GitHub API error');

    expect(mockTerminateInternalAgent).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      agentId: 'agent-new',
    }));
  });

  it('passes additional context to hiring instructions', async () => {
    await runInternalHiring(mockDb, makeInput({ additionalContext: 'Custom context for the agent' }));

    expect(mockGenerateHiredAgentInstructions).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      additionalContext: 'Custom context for the agent',
    }));
  });
});

describe('runInternalTermination', () => {
  it('delegates to terminateInternalAgent', async () => {
    await runInternalTermination(mockDb, {
      agentId: 'agent-1',
      workspaceBasePath: '/ws',
      githubApps: createMockGitHubApps() as any,
      emailMailboxes: null,
      coolify: null,
      schedules: createMockSchedules() as any,
    });

    expect(mockTerminateInternalAgent).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      agentId: 'agent-1',
      workspaceBasePath: '/ws',
    }));
  });
});
