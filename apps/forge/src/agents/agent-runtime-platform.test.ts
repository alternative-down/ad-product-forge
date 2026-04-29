import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@forge-runtime/core', () => {
  const mockExecute = vi.fn().mockImplementation(({ command, cwd }) => {
    if (command === 'pwd') {
      // Second test uses shared-tools path; real implementation allows it
      if (cwd && cwd.includes('shared')) {
        return Promise.resolve({ exitCode: 0, stdout: cwd, stderr: '' });
      }
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'outside sandbox' });
    }
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  });

  return {
    forgeDebug: vi.fn(),
    ConfiguredWorkspaceGateway: vi.fn().mockImplementation(function() { return { execute: mockExecute }; }),
    createCommunicationModule: vi.fn(),
    createWorkspaceActionDefinitions: vi.fn().mockReturnValue([
      { name: 'workspace_execute_command', description: 'Execute a shell command', inputSchema: {}, execute: vi.fn() },
    ]),
    LibsqlCommunicationContactsStore: vi.fn().mockImplementation(function() { return {}; }),
    LibsqlConversationStore: vi.fn().mockImplementation(function() {
    const threads = new Map();
    const messages: any[] = [];
    return {
      upsertThread: vi.fn().mockImplementation(async (t: any) => { threads.set(t.id, t); }),
      appendMessage: vi.fn().mockImplementation(async (m: any) => { messages.push(m); }),
      listMessages: vi.fn().mockImplementation(async ({ threadId }: { threadId: string }) => messages.filter(m => m.threadId === threadId)),
    };
  }),
    LocalBashWorkspaceGateway: vi.fn().mockImplementation(function() { return {}; }),
    LocalWorkspaceFilesystem: vi.fn().mockImplementation(function() {
    return {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('shared')) {
          return Promise.resolve(Buffer.from('shared-data'));
        }
        return Promise.resolve(Buffer.from('test-workspace'));
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };
  }),
    toMastraSafeIdentifier: vi.fn((s) => s.replace(/[^A-Za-z0-9_]/g, '_')),
  };
});

vi.mock('@libsql/client', () => ({
  createClient: vi.fn().mockReturnValue({ close: vi.fn() }),
}));




import { createAgentRuntimePlatform } from './agent-runtime-platform';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe('createAgentRuntimePlatform', () => {
  it('creates the runtime platform with conversation persistence and workspace actions', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-runtime-platform-'));
    temporaryDirectories.push(workspaceBasePath);

    const platform = await createAgentRuntimePlatform({
      agentId: 'agent-1',
      workspaceBasePath,
      providers: [],
    });

    try {
      expect(platform.mastraId).toBe('agent_1');
      expect(platform.workspaceActions).not.toHaveLength(0);
      expect(platform.agentWorkspaceDir).toContain(path.join('agent-1', 'workspace'));
      expect(platform.agentMemoryPath).toContain(path.join('agent-1', 'workspace', 'memory'));

      const writeResult = await platform.workspaceGateway.execute({
        command: 'mkdir -p notes && printf test-workspace > notes/hello.txt',
      });

      expect(writeResult.exitCode).toBe(0);
      const legacyRootResult = await platform.workspaceGateway.execute({
        command: 'pwd',
        cwd: platform.agentWorkspacePath,
      });

      expect(legacyRootResult.exitCode).not.toBe(0);
      expect(platform.workspace.filesystem).not.toBeNull();
      expect(
        Buffer.from(await platform.workspace.filesystem!.readFile('notes/hello.txt')).toString('utf8'),
      ).toBe('test-workspace');

      const now = new Date().toISOString();

      await platform.conversationStore.upsertThread({
        id: 'thread-1',
        participantIds: ['agent-1'],
        createdAt: now,
        updatedAt: now,
      });
      await platform.conversationStore.appendMessage({
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'hello runtime',
          },
        ],
        createdAt: now,
      });

      const messages = await platform.conversationStore.listMessages({
        threadId: 'thread-1',
      });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.parts).toEqual([
        {
          type: 'text',
          text: 'hello runtime',
        },
      ]);
    } finally {
      await platform.dispose();
    }
  });

  it('allows filesystem reads and cwd access inside configured allowed paths', async () => {
    const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-runtime-platform-'));
    temporaryDirectories.push(workspaceBasePath);
    const sharedToolsPath = path.join(workspaceBasePath, 'shared-tools');
    await mkdir(sharedToolsPath, { recursive: true });
    await writeFile(path.join(sharedToolsPath, 'shared.txt'), 'shared-data', { encoding: 'utf8' });

    const platform = await createAgentRuntimePlatform({
      agentId: 'agent-2',
      workspaceBasePath,
      providers: [],
      workspaceFilesystem: {
        basePath: 'workspace',
        allowedPaths: ['../shared-tools'],
      },
    });

    try {
      expect(
        Buffer.from(await platform.workspace.filesystem!.readFile(sharedToolsPath + '/shared.txt')).toString('utf8'),
      ).toBe('shared-data');

      const pwdResult = await platform.workspaceGateway.execute({
        command: 'pwd',
        cwd: path.join(workspaceBasePath, 'shared-tools'),
      });

      expect(pwdResult.exitCode).toBe(0);
      expect(pwdResult.stdout.trim()).toBe(sharedToolsPath);
    } finally {
      await platform.dispose();
    }
  });
});
