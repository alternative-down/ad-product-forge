import { forgeDebug } from '@forge-runtime/core';
import { createClient } from '@libsql/client';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type CommunicationProvider,
  ConfiguredWorkspaceGateway,
  createCommunicationModule,
  createWorkspaceActionDefinitions,
  LibsqlCommunicationContactsStore,
  LibsqlConversationStore,
  LocalBashWorkspaceGateway,
  LocalWorkspaceFilesystem,
  toMastraSafeIdentifier,
  type CommunicationModule,
} from '@forge-runtime/core';

import type {
  WorkspaceFilesystemConfig,
  WorkspaceSandboxConfig,
  WorkspaceSkillsConfig,
} from '../../database/schema';
import type { RuntimeWorkspace } from './runtime/types';

type CommunicationWorkspaceFilesystem = {
  readFile(path: string): Promise<string | Uint8Array | Buffer>;
  writeFile(path: string, data: Uint8Array | Buffer | string): Promise<void>;
};

function normalizeWorkspaceFilesystemPath(targetPath: string) {
  const normalizedPath = targetPath.split(path.sep).join(path.posix.sep);

  return path.posix.normalize(normalizedPath);
}

async function pathExists(targetPath: string) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    forgeDebug({ scope: 'agent-runtime-platform', level: 'warn', message: 'Path does not exist', context: { error: error instanceof Error ? error.message : String(error), path: targetPath } });
    return false;
  }
}

async function moveLegacyMemoryDirectory(sourcePath: string, targetPath: string): Promise<void> {
  const sourceExists = await pathExists(sourcePath);

  if (!sourceExists) {
    return;
  }

  const targetExists = await pathExists(targetPath);

  if (!targetExists) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.rename(sourcePath, targetPath);
    return;
  }

  const sourceEntries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of sourceEntries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      await moveLegacyMemoryDirectory(sourceEntryPath, targetEntryPath);
      continue;
    }

    await fs.mkdir(path.dirname(targetEntryPath), { recursive: true });
    await fs.rm(targetEntryPath, { recursive: true, force: true });
    await fs.rename(sourceEntryPath, targetEntryPath);
  }

  await fs.rm(sourcePath, { recursive: true, force: true });
}

function resolveAllowedPaths(input: {
  agentWorkspacePath: string;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
}) {
  return (input.workspaceFilesystem?.allowedPaths ?? []).map((allowedPath) =>
    path.isAbsolute(allowedPath)
      ? path.resolve(allowedPath)
      : path.resolve(input.agentWorkspacePath, allowedPath));
}

export async function createAgentRuntimePlatform(input: {
  agentId: string;
  workspaceBasePath: string;
  providers?: CommunicationProvider[];
  communication?: CommunicationModule;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
  workspaceSkills?: WorkspaceSkillsConfig;
  communicationDmFlushingEnabled?: boolean;
  communicationGroupFlushingEnabled?: boolean;
}) {
  const mastraId = toMastraSafeIdentifier(input.agentId);
  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  const agentDatabasePath = path.resolve(agentWorkspacePath, 'database.db');
  const agentWorkspaceDir = input.workspaceFilesystem?.basePath
    ? path.resolve(agentWorkspacePath, input.workspaceFilesystem.basePath)
    : path.resolve(agentWorkspacePath, 'workspace');
  const agentMemoryPath = path.resolve(agentWorkspaceDir, 'memory');
  const legacyAgentMemoryPath = path.resolve(agentWorkspacePath, 'workspace-memory');
  const allowedPaths = resolveAllowedPaths({
    agentWorkspacePath,
    workspaceFilesystem: input.workspaceFilesystem,
  });
  const sandboxWorkingDirectory = input.workspaceSandbox?.workingDirectory
    ? path.resolve(agentWorkspacePath, input.workspaceSandbox.workingDirectory)
    : agentWorkspaceDir;

  await fs.mkdir(agentWorkspacePath, { recursive: true });
  await fs.mkdir(agentWorkspaceDir, { recursive: true });
  await moveLegacyMemoryDirectory(legacyAgentMemoryPath, agentMemoryPath);

  const client = createClient({ url: `file:${agentDatabasePath}` });
    client.execute('PRAGMA foreign_keys = ON');
  const conversationStore = new LibsqlConversationStore({
    client,
    tablePrefix: mastraId,
  });
  const communicationContactsStore = new LibsqlCommunicationContactsStore({
    client,
    tablePrefix: mastraId,
  });
  const workspaceFs = new LocalWorkspaceFilesystem({
    root: agentWorkspaceDir,
    allowedPaths,
  });
  const workspaceFilesystem: RuntimeWorkspace['filesystem'] = {
    async exists(targetPath: string) {
      return await workspaceFs.exists(normalizeWorkspaceFilesystemPath(targetPath));
    },
    async readFile(targetPath: string) {
      return await workspaceFs.readFile(normalizeWorkspaceFilesystemPath(targetPath));
    },
  };
  const communicationWorkspaceFilesystem: CommunicationWorkspaceFilesystem = {
    async readFile(targetPath: string) {
      return await workspaceFs.readFile(normalizeWorkspaceFilesystemPath(targetPath));
    },
    async writeFile(targetPath: string, data: Uint8Array | Buffer | string) {
      await workspaceFs.writeFile(normalizeWorkspaceFilesystemPath(targetPath), data);
    },
  };
  const workspace: RuntimeWorkspace = {
    filesystem: workspaceFilesystem,
  };
  const workspaceGateway = new ConfiguredWorkspaceGateway({
    base: new LocalBashWorkspaceGateway({
      root: agentWorkspaceDir,
      pathAliases: allowedPaths,
    }),
    cwd: sandboxWorkingDirectory,
    workspaceRoot: agentWorkspaceDir,
  });

  const communication: CommunicationModule = input.communication ?? await createCommunicationModule({
    providers: input.providers ?? [],
    workspace: {
      filesystem: communicationWorkspaceFilesystem,
    },
    workspaceRoot: agentWorkspaceDir,
    contactsStore: communicationContactsStore,
  });

  return {
    mastraId,
    workspace,
    conversationStore,
    workspaceGateway,
    workspaceActions: createWorkspaceActionDefinitions(workspaceGateway, {
      filesystem: workspaceFs,
      workspaceRoot: agentWorkspaceDir,
    }),
    communication,
    agentWorkspacePath,
    agentWorkspaceDir,
    agentMemoryPath,
    client,
    dispose() {
      client.close();
    },
  };
}
