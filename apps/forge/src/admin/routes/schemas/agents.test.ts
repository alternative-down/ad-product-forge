/**
 * Unit tests for admin/routes/schemas/agents.ts.
 * Zod validation schemas for agent admin routes.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  agentIdQuerySchema,
  updateAgentGitHubManifestConfigSchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
  agentActionSchema,
  clearAgentHistorySchema,
  agentLongTermMemoryRecallSearchSchema,
  topUpAgentContractSchema,
  adjustAgentContractBudgetSchema,
  renewAgentContractSchema,
  hireAgentSchema,
  terminateAgentSchema,
  changeAgentRoleSchema,
  updateAgentConfigSchema,
} from './agents';

// ─── agentIdQuerySchema ───────────────────────────────────────────────────────

describe('agentIdQuerySchema', () => {
  it('parses valid agentId', () => {
    expect(agentIdQuerySchema.parse({ agentId: 'agent-123' })).toMatchObject({
      agentId: 'agent-123',
    });
  });

  it('rejects missing agentId', () => {
    expect(() => agentIdQuerySchema.parse({})).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => agentIdQuerySchema.parse({ agentId: '' })).toThrow();
  });
});

// ─── updateAgentGitHubManifestConfigSchema ───────────────────────────────────

describe('updateAgentGitHubManifestConfigSchema', () => {
  it('parses full valid manifest config', () => {
    const result = updateAgentGitHubManifestConfigSchema.parse({
      agentId: 'agent-1',
      manifestConfig: {
        permissions: {
          administration: true,
          contents: true,
          issues: false,
          metadata: true,
          organization_projects: false,
          pull_requests: true,
          repository_projects: false,
          workflows: true,
        },
        events: {
          push: true,
          pull_request: true,
          pull_request_review: false,
          issues: false,
          issue_comment: false,
          repository: true,
          workflow_run: false,
        },
      },
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.manifestConfig.permissions.contents).toBe(true);
    expect(result.manifestConfig.events.push).toBe(true);
  });

  it('parses minimal manifest config (all false)', () => {
    const result = updateAgentGitHubManifestConfigSchema.parse({
      agentId: 'a',
      manifestConfig: {
        permissions: {
          administration: false,
          contents: false,
          issues: false,
          metadata: false,
          organization_projects: false,
          pull_requests: false,
          repository_projects: false,
          workflows: false,
        },
        events: {
          push: false,
          pull_request: false,
          pull_request_review: false,
          issues: false,
          issue_comment: false,
          repository: false,
          workflow_run: false,
        },
      },
    });
    expect(result.manifestConfig.permissions.contents).toBe(false);
  });

  it('rejects missing manifestConfig', () => {
    expect(() => updateAgentGitHubManifestConfigSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects missing agentId', () => {
    expect(() =>
      updateAgentGitHubManifestConfigSchema.parse({
        manifestConfig: { permissions: {} as never, events: {} as never },
      }),
    ).toThrow();
  });
});

// ─── agentExecutionStepsQuerySchema ─────────────────────────────────────────

describe('agentExecutionStepsQuerySchema', () => {
  it('parses minimal input with defaults', () => {
    const result = agentExecutionStepsQuerySchema.parse({ agentId: 'agent-1' });
    expect(result.agentId).toBe('agent-1');
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('parses with explicit limit and offset', () => {
    const result = agentExecutionStepsQuerySchema.parse({ agentId: 'a', limit: 50, offset: 10 });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('coerces string limit to number', () => {
    const result = agentExecutionStepsQuerySchema.parse({ agentId: 'a', limit: '25' });
    expect(result.limit).toBe(25);
  });

  it('rejects limit less than 1', () => {
    expect(() => agentExecutionStepsQuerySchema.parse({ agentId: 'a', limit: 0 })).toThrow();
  });

  it('rejects limit greater than 100', () => {
    expect(() => agentExecutionStepsQuerySchema.parse({ agentId: 'a', limit: 101 })).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() => agentExecutionStepsQuerySchema.parse({ agentId: 'a', offset: -1 })).toThrow();
  });
});

// ─── agentThreadMessagesQuerySchema ──────────────────────────────────────────

describe('agentThreadMessagesQuerySchema', () => {
  it('parses minimal input with defaults', () => {
    const result = agentThreadMessagesQuerySchema.parse({ agentId: 'agent-1' });
    expect(result.page).toBe(0);
    expect(result.perPage).toBe(20);
  });

  it('parses with explicit page and perPage', () => {
    const result = agentThreadMessagesQuerySchema.parse({ agentId: 'a', page: 5, perPage: 50 });
    expect(result.page).toBe(5);
    expect(result.perPage).toBe(50);
  });

  it('coerces string values', () => {
    const result = agentThreadMessagesQuerySchema.parse({ agentId: 'a', page: '2', perPage: '10' });
    expect(result.page).toBe(2);
    expect(result.perPage).toBe(10);
  });

  it('rejects negative page', () => {
    expect(() => agentThreadMessagesQuerySchema.parse({ agentId: 'a', page: -1 })).toThrow();
  });

  it('rejects perPage less than 1', () => {
    expect(() => agentThreadMessagesQuerySchema.parse({ agentId: 'a', perPage: 0 })).toThrow();
  });

  it('rejects perPage greater than 100', () => {
    expect(() => agentThreadMessagesQuerySchema.parse({ agentId: 'a', perPage: 101 })).toThrow();
  });
});

// ─── agentConversationMessagesQuerySchema ───────────────────────────────────

describe('agentConversationMessagesQuerySchema', () => {
  it('parses minimal input with defaults', () => {
    const result = agentConversationMessagesQuerySchema.parse({
      agentId: 'a',
      provider: 'p',
      targetKey: 'u@example.com',
    });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('parses with explicit limit and offset', () => {
    const result = agentConversationMessagesQuerySchema.parse({
      agentId: 'a',
      provider: 'p',
      targetKey: 'u',
      limit: 30,
      offset: 5,
    });
    expect(result.limit).toBe(30);
    expect(result.offset).toBe(5);
  });

  it('rejects missing provider', () => {
    expect(() =>
      agentConversationMessagesQuerySchema.parse({ agentId: 'a', targetKey: 'u' }),
    ).toThrow();
  });

  it('rejects missing targetKey', () => {
    expect(() =>
      agentConversationMessagesQuerySchema.parse({ agentId: 'a', provider: 'p' }),
    ).toThrow();
  });

  it('rejects limit less than 1', () => {
    expect(() =>
      agentConversationMessagesQuerySchema.parse({
        agentId: 'a',
        provider: 'p',
        targetKey: 'u',
        limit: 0,
      }),
    ).toThrow();
  });
});

// ─── agentActionSchema ───────────────────────────────────────────────────────

describe('agentActionSchema', () => {
  it('parses with agentId', () => {
    expect(agentActionSchema.parse({ agentId: 'agent-1' })).toMatchObject({ agentId: 'agent-1' });
  });

  it('rejects missing agentId', () => {
    expect(() => agentActionSchema.parse({})).toThrow();
  });
});

// ─── clearAgentHistorySchema ─────────────────────────────────────────────────

describe('clearAgentHistorySchema', () => {
  it('parses with agentId only (defaults includeLongTermMemoryThread)', () => {
    const result = clearAgentHistorySchema.parse({ agentId: 'agent-1' });
    expect(result.agentId).toBe('agent-1');
    expect(result.includeLongTermMemoryThread).toBe(true);
  });

  it('parses with explicit includeLongTermMemoryThread false', () => {
    const result = clearAgentHistorySchema.parse({
      agentId: 'a',
      includeLongTermMemoryThread: false,
    });
    expect(result.includeLongTermMemoryThread).toBe(false);
  });

  it('rejects missing agentId', () => {
    expect(() => clearAgentHistorySchema.parse({})).toThrow();
  });
});

// ─── agentLongTermMemoryRecallSearchSchema ───────────────────────────────────

describe('agentLongTermMemoryRecallSearchSchema', () => {
  it('parses minimal input with defaults', () => {
    const result = agentLongTermMemoryRecallSearchSchema.parse({
      agentId: 'agent-1',
      query: 'find payments',
    });
    expect(result.limit).toBe(10);
  });

  it('parses with explicit limit', () => {
    const result = agentLongTermMemoryRecallSearchSchema.parse({
      agentId: 'a',
      query: 'q',
      limit: 25,
    });
    expect(result.limit).toBe(25);
  });

  it('coerces string limit', () => {
    const result = agentLongTermMemoryRecallSearchSchema.parse({
      agentId: 'a',
      query: 'q',
      limit: '15',
    });
    expect(result.limit).toBe(15);
  });

  it('rejects missing query', () => {
    expect(() => agentLongTermMemoryRecallSearchSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects empty query', () => {
    expect(() =>
      agentLongTermMemoryRecallSearchSchema.parse({ agentId: 'a', query: '' }),
    ).toThrow();
  });

  it('rejects limit less than 1', () => {
    expect(() =>
      agentLongTermMemoryRecallSearchSchema.parse({
        agentId: 'a',
        query: 'q',
        limit: 0,
      }),
    ).toThrow();
  });
});

// ─── Contract schemas (topUp, adjust, renew) ─────────────────────────────────

describe('topUpAgentContractSchema', () => {
  it('parses valid input', () => {
    const result = topUpAgentContractSchema.parse({ agentId: 'a', amountUsd: 50.0 });
    expect(result.amountUsd).toBe(50);
  });

  it('rejects zero amount', () => {
    expect(() => topUpAgentContractSchema.parse({ agentId: 'a', amountUsd: 0 })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => topUpAgentContractSchema.parse({ agentId: 'a', amountUsd: -10 })).toThrow();
  });

  it('rejects missing amountUsd', () => {
    expect(() => topUpAgentContractSchema.parse({ agentId: 'a' })).toThrow();
  });
});

describe('adjustAgentContractBudgetSchema', () => {
  it('parses valid input', () => {
    expect(
      adjustAgentContractBudgetSchema.parse({ agentId: 'a', newBudgetUsd: 200 }),
    ).toMatchObject({ newBudgetUsd: 200 });
  });

  it('rejects zero budget', () => {
    expect(() =>
      adjustAgentContractBudgetSchema.parse({ agentId: 'a', newBudgetUsd: 0 }),
    ).toThrow();
  });

  it('rejects missing newBudgetUsd', () => {
    expect(() => adjustAgentContractBudgetSchema.parse({ agentId: 'a' })).toThrow();
  });
});

describe('renewAgentContractSchema', () => {
  it('parses valid input', () => {
    expect(renewAgentContractSchema.parse({ agentId: 'a', newBudgetUsd: 100 })).toMatchObject({
      newBudgetUsd: 100,
    });
  });

  it('rejects negative budget', () => {
    expect(() => renewAgentContractSchema.parse({ agentId: 'a', newBudgetUsd: -1 })).toThrow();
  });
});

// ─── Agent management schemas ─────────────────────────────────────────────────

describe('hireAgentSchema', () => {
  it('parses minimal valid input', () => {
    const result = hireAgentSchema.parse({
      hiringRequest: 'Build a payment integration',
      weeklyBudgetUsd: 100,
    });
    expect(result.hiringRequest).toBe('Build a payment integration');
    expect(result.weeklyBudgetUsd).toBe(100);
  });

  it('parses with optional additionalContext', () => {
    const result = hireAgentSchema.parse({
      hiringRequest: 'r',
      weeklyBudgetUsd: 50,
      additionalContext: 'Use Stripe',
    });
    expect(result.additionalContext).toBe('Use Stripe');
  });

  it('rejects missing hiringRequest', () => {
    expect(() => hireAgentSchema.parse({ weeklyBudgetUsd: 100 })).toThrow();
  });

  it('rejects empty hiringRequest', () => {
    expect(() => hireAgentSchema.parse({ hiringRequest: '', weeklyBudgetUsd: 100 })).toThrow();
  });

  it('rejects zero budget', () => {
    expect(() => hireAgentSchema.parse({ hiringRequest: 'r', weeklyBudgetUsd: 0 })).toThrow();
  });

  it('rejects negative budget', () => {
    expect(() => hireAgentSchema.parse({ hiringRequest: 'r', weeklyBudgetUsd: -5 })).toThrow();
  });
});

describe('terminateAgentSchema', () => {
  it('parses with agentId', () => {
    expect(terminateAgentSchema.parse({ agentId: 'agent-1' })).toMatchObject({
      agentId: 'agent-1',
    });
  });

  it('rejects missing agentId', () => {
    expect(() => terminateAgentSchema.parse({})).toThrow();
  });
});

describe('changeAgentRoleSchema', () => {
  it('parses valid input', () => {
    expect(changeAgentRoleSchema.parse({ agentId: 'a', roleId: 'role-1' })).toMatchObject({
      roleId: 'role-1',
    });
  });

  it('rejects missing agentId', () => {
    expect(() => changeAgentRoleSchema.parse({ roleId: 'r' })).toThrow();
  });

  it('rejects missing roleId', () => {
    expect(() => changeAgentRoleSchema.parse({ agentId: 'a' })).toThrow();
  });
});

describe('updateAgentConfigSchema', () => {
  it('parses minimal input (agentId only)', () => {
    const result = updateAgentConfigSchema.parse({ agentId: 'agent-1' });
    expect(result.agentId).toBe('agent-1');
  });

  it('parses with all optional fields', () => {
    const result = updateAgentConfigSchema.parse({
      agentId: 'a',
      name: 'My Agent',
      description: 'A helpful agent',
      instructions: 'Be concise',
      workspaceAutoSync: true,
      workspaceBm25: false,
      modelProfileId: 'gpt-4o',
      omModelProfileId: 'claude-3-5',
    });
    expect(result.name).toBe('My Agent');
    expect(result.workspaceAutoSync).toBe(true);
    expect(result.omModelProfileId).toBe('claude-3-5');
  });

  it('rejects missing agentId', () => {
    expect(() => updateAgentConfigSchema.parse({ name: 'n' })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => updateAgentConfigSchema.parse({ agentId: '' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('agentIdQuerySchema safeParse returns success false for missing agentId', () => {
    expect(agentIdQuerySchema.safeParse({}).success).toBe(false);
  });

  it('hireAgentSchema safeParse returns success true for valid input', () => {
    const result = hireAgentSchema.safeParse({ hiringRequest: 'r', weeklyBudgetUsd: 50 });
    expect(result.success).toBe(true);
  });

  it('topUpAgentContractSchema safeParse returns success false for zero amount', () => {
    const result = topUpAgentContractSchema.safeParse({ agentId: 'a', amountUsd: 0 });
    expect(result.success).toBe(false);
  });

  it('updateAgentConfigSchema safeParse returns success true for agentId-only', () => {
    const result = updateAgentConfigSchema.safeParse({ agentId: 'a' });
    expect(result.success).toBe(true);
  });
});
