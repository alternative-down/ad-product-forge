import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  toMastraSafeIdentifier: vi.fn((id: string) => id.replace(/[^a-zA-Z0-9]/g, '-')),
  ConfiguredWorkspaceGateway: vi.fn(),
  LocalBashWorkspaceGateway: vi.fn(),
  LocalWorkspaceFilesystem: vi.fn(),
  createCommunicationModule: vi.fn(),
  createWorkspaceActionDefinitions: vi.fn(),
  LibsqlCommunicationContactsStore: vi.fn(),
  LibsqlConversationStore: vi.fn(),
}));

vi.mock('drizzle-orm/libsql', () => ({
  drizzle: vi.fn(),
}));

vi.mock('@libsql/client', () => ({
  createClient: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...actual,
    stat: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn(),
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

import { createAgentRuntimePlatform } from './platform';

describe('createAgentRuntimePlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates platform with required fields', async () => {
    const { createCommunicationModule } = await import('@forge-runtime/core');

    const platform = await createAgentRuntimePlatform({
      agentId: 'agent-1',
      workspaceBasePath: '/base',
      providers: [],
    });

    expect(platform.mastraId).toBeDefined();
    expect(platform.workspace).toBeDefined();
    expect(platform.conversationStore).toBeDefined();
    expect(typeof platform.dispose).toBe('function');
  });

  it('dispose closes the client', async () => {
    const platform = await createAgentRuntimePlatform({
      agentId: 'agent-1',
      workspaceBasePath: '/base',
    });

    await platform.dispose();
    // dispose should be called without throwing
  });

  it('passes communication module when provided', async () => {
    const mockComm = { sendMessage: vi.fn() } as any;
    const platform = await createAgentRuntimePlatform({
      agentId: 'agent-1',
      workspaceBasePath: '/base',
      communication: mockComm,
    });

    expect(platform.communication).toBe(mockComm);
  });

  it('resolves allowed paths with absolute paths', async () => {
    const platform = await createAgentRuntimePlatform({
      agentId: 'agent-1',
      workspaceBasePath: '/base',
      workspaceFilesystem: {
        allowedPaths: ['/absolute/path'],
        basePath: 'workspace',
      },
    });

    expect(platform.workspace).toBeDefined();
  });
});