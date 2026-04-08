import { createClient } from '@libsql/client';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import {
  LocalFilesystem,
  LocalSandbox,
  Workspace as WorkspaceRuntime,
} from '@mastra/core/workspace';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createCommunicationModule,
  type CommunicationModule,
  type CommunicationProvider,
  toMastraSafeIdentifier,
} from '@mastra-engine/core';

import type {
  WorkspaceFilesystemConfig,
  WorkspaceSandboxConfig,
  WorkspaceSkillsConfig,
} from '../database/schema';
import { ensureBundledWorkspaceSkills } from './bundled-workspace-skills';

interface MastraMemoryStore {
  createThread(params: { resourceId?: string; threadId: string }): Promise<unknown>;
}

function hasCreateThread(store: unknown): store is MastraMemoryStore {
  return (
    typeof store === 'object' &&
    store !== null &&
    'createThread' in store &&
    typeof (store as MastraMemoryStore).createThread === 'function'
  );
}

export async function createAgentRuntimePlatform(input: {
  agentId: string;
  workspaceBasePath: string;
  providers?: CommunicationProvider[];
  communication?: CommunicationModule;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
  workspaceSkills?: WorkspaceSkillsConfig;
}) {
  const mastraId = toMastraSafeIdentifier(input.agentId);
  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  const agentDatabasePath = path.resolve(agentWorkspacePath, 'database.db');
  const agentWorkspaceDir = input.workspaceFilesystem?.basePath
    ? path.resolve(agentWorkspacePath, input.workspaceFilesystem.basePath)
    : path.resolve(agentWorkspacePath, 'workspace');
  const agentMemoryPath = path.resolve(agentWorkspacePath, 'workspace-memory');
  const sandboxWorkingDirectory = input.workspaceSandbox?.workingDirectory
    ? path.resolve(agentWorkspacePath, input.workspaceSandbox.workingDirectory)
    : agentWorkspaceDir;

  await fs.mkdir(agentWorkspacePath, { recursive: true });

  const dbUrl = `file:${agentDatabasePath}`;
  const client = createClient({ url: dbUrl });
  const storage = new LibSQLStore({ id: `${mastraId}_storage`, client });
  const vector = new LibSQLVector({ id: `${mastraId}_vector`, url: dbUrl });
  const workspace = new WorkspaceRuntime({
    autoSync: true,
    bm25: true,
    filesystem: new LocalFilesystem({
      basePath: agentWorkspaceDir,
    }),
    lsp: false,
    sandbox: new LocalSandbox({
      isolation: 'none',
      workingDirectory: sandboxWorkingDirectory,
    }),
    skills: input.workspaceSkills ?? ['**/skills'],
  });

  await workspace.init();
  await ensureBundledWorkspaceSkills(agentWorkspaceDir);

  if (hasCreateThread(storage.stores.memory)) {
    await storage.stores.memory.createThread({
      resourceId: mastraId,
      threadId: mastraId,
    });
  }

  const communication = input.communication ?? await createCommunicationModule({
    client,
    providers: input.providers ?? [],
    workspace,
    workspaceRoot: agentWorkspaceDir,
  });

  return {
    mastraId,
    workspace,
    storage,
    vector,
    communication,
    agentWorkspacePath,
    agentWorkspaceDir,
    agentMemoryPath,
  };
}
