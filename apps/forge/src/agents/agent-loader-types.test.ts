import { describe, expect, it } from 'vitest';
import type {
  AgentLoaderConfig,
  SingleAgentLoaderConfig,
  AgentLoaderInput,
} from './agent-loader-types';

describe('AgentLoaderConfig', () => {
  it('requires workspaceBasePath', () => {
    const config: AgentLoaderConfig = {
      workspaceBasePath: '/workspace',
      githubApps: { isConfigured: async () => false } as never,
      emailMailboxes: null,
      coolify: null,
      schedules: { listActive: async () => [] } as never,
      internalChat: { sendMessage: async () => '' } as never,
    };
    expect(config.workspaceBasePath).toBe('/workspace');
  });

  it('allows optional minimax', () => {
    const config: AgentLoaderConfig = {
      workspaceBasePath: '/workspace',
      githubApps: { isConfigured: async () => false } as never,
      emailMailboxes: null,
      coolify: null,
      schedules: { listActive: async () => [] } as never,
      internalChat: { sendMessage: async () => '' } as never,
    };
    expect(config.minimax).toBeUndefined();
  });

  it('allows coolify', () => {
    const config: AgentLoaderConfig = {
      workspaceBasePath: '/workspace',
      githubApps: { isConfigured: async () => false } as never,
      emailMailboxes: null,
      coolify: { deployApp: async () => ({ id: '1' }) } as never,
      schedules: { listActive: async () => [] } as never,
      internalChat: { sendMessage: async () => '' } as never,
    };
    expect(config.coolify).not.toBeNull();
  });

  it('allows emailMailboxes', () => {
    const config: AgentLoaderConfig = {
      workspaceBasePath: '/workspace',
      githubApps: { isConfigured: async () => false } as never,
      emailMailboxes: { send: async () => ({ sent: true }) } as never,
      coolify: null,
      schedules: { listActive: async () => [] } as never,
      internalChat: { sendMessage: async () => '' } as never,
    };
    expect(config.emailMailboxes).not.toBeNull();
  });
});

describe('SingleAgentLoaderConfig', () => {
  it('extends AgentLoaderConfig with agentId', () => {
    const config: SingleAgentLoaderConfig = {
      workspaceBasePath: '/workspace',
      agentId: 'agent-1',
      githubApps: { isConfigured: async () => false } as never,
      emailMailboxes: null,
      coolify: null,
      schedules: { listActive: async () => [] } as never,
      internalChat: { sendMessage: async () => '' } as never,
    };
    expect(config.agentId).toBe('agent-1');
    expect(config.workspaceBasePath).toBe('/workspace');
  });
});

describe('AgentLoaderInput', () => {
  it('combines db and config', () => {
    const input: AgentLoaderInput = {
      db: {} as never,
      config: {
        workspaceBasePath: '/workspace',
        githubApps: { isConfigured: async () => false } as never,
        emailMailboxes: null,
        coolify: null,
        schedules: { listActive: async () => [] } as never,
        internalChat: { sendMessage: async () => '' } as never,
      },
    };
    expect(input.db).toBeDefined();
    expect(input.config.workspaceBasePath).toBe('/workspace');
  });
});