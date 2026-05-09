import { describe, expect, it } from 'vitest';


vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  createTool: vi.fn((config) => ({ name: config.id, inputSchema: config.inputSchema, type: 'tool' })),
  toolsToRuntimeActions: vi.fn((tools) =>
    Object.values(tools).map((t) => ({ name: t.name, inputSchema: t.inputSchema }))
  ),
}));

import { toolsToRuntimeActions } from '@forge-runtime/core';

import { createInternalAgentTools } from './internal-agent-tools';
import type { Database } from '../database/schema';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import type { InternalChatService } from '../communication/internal-chat-service';

function createInternalAgentToolConfig() {
  return {
    db: null as unknown as Database,
    workspaceBasePath: '/tmp/forge-test-workspace',
    githubApps: null as unknown as GitHubAppManager,
    emailMailboxes: null as AgentEmailManager | null,
    coolify: null as CoolifyManager | null,
    schedules: null as unknown as ReturnType<typeof createAgentScheduleManager>,
    internalChat: null as unknown as InternalChatService,
  };
}

describe('createInternalAgentTools', () => {
  it('maps internal agent tools into runtime actions with zod schemas', () => {
    const tools = createInternalAgentTools(createInternalAgentToolConfig());
    const actions = toolsToRuntimeActions(tools);

    expect(actions.map((action) => action.name).sort()).toEqual([
      'hire-internal-agent',
      'terminate-internal-agent',
    ]);
    const hireAction = actions.find((action) => action.name === 'hire-internal-agent');
    const terminateAction = actions.find((action) => action.name === 'terminate-internal-agent');

    expect(() =>
      hireAction?.inputSchema.parse({
        hiringRequest: 'Hire a backend engineer focused on reliability.',
        weeklyBudgetUsd: 250,
      })).not.toThrow();
    expect(() =>
      terminateAction?.inputSchema.parse({
        agentId: 'agent-1',
      })).not.toThrow();
    expect(() =>
      hireAction?.inputSchema.parse({
        weeklyBudgetUsd: 250,
      })).toThrow();
  });
});
