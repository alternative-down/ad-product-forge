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
  toMastraSafeIdentifier,
  type CommunicationModule,
} from '@forge-runtime/core';
import { ReadWriteFs } from 'just-bash';

import type {
  WorkspaceFilesystemConfig,
  WorkspaceSandboxConfig,
  WorkspaceSkillsConfig,
} from '../database/schema';
import type { RuntimeWorkspace } from './agent-runtime-types';

type CommunicationWorkspaceFilesystem = {
  readFile(path: string): Promise<string | Uint8Array | Buffer>;
  writeFile(path: string, data: Uint8Array | Buffer | string): Promise<void>;
};

function toVirtualWorkspacePath(targetPath: string) {
  const normalizedPath = targetPath.split(path.sep).join(path.posix.sep);
  const virtualPath = path.posix.normalize(path.posix.join('/', normalizedPath));

  if (virtualPath.startsWith('/..')) {
    throw new Error(`Workspace path must stay within root: ${targetPath}`);
  }

  return virtualPath;
}

async function pathExists(targetPath: string) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
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
  const sandboxWorkingDirectory = input.workspaceSandbox?.workingDirectory
    ? path.resolve(agentWorkspacePath, input.workspaceSandbox.workingDirectory)
    : agentWorkspaceDir;

  await fs.mkdir(agentWorkspacePath, { recursive: true });
  await fs.mkdir(agentWorkspaceDir, { recursive: true });
  await moveLegacyMemoryDirectory(legacyAgentMemoryPath, agentMemoryPath);

  const client = createClient({ url: `file:${agentDatabasePath}` });
  const conversationStore = new LibsqlConversationStore({
    client,
    tablePrefix: mastraId,
  });
  const communicationContactsStore = new LibsqlCommunicationContactsStore({
    client,
    tablePrefix: mastraId,
  });
  const workspaceFs = new ReadWriteFs({
    root: agentWorkspaceDir,
  });
  const workspaceFilesystem: RuntimeWorkspace['filesystem'] = {
    async exists(targetPath: string) {
      return workspaceFs.exists(toVirtualWorkspacePath(targetPath));
    },
    async readFile(targetPath: string) {
      return workspaceFs.readFileBuffer(toVirtualWorkspacePath(targetPath));
    },
  };
  const communicationWorkspaceFilesystem: CommunicationWorkspaceFilesystem = {
    async readFile(targetPath: string) {
      return workspaceFs.readFileBuffer(toVirtualWorkspacePath(targetPath));
    },
    async writeFile(targetPath: string, data: Uint8Array | Buffer | string) {
      const virtualPath = toVirtualWorkspacePath(targetPath);
      await workspaceFs.mkdir(path.posix.dirname(virtualPath), { recursive: true });
      await workspaceFs.writeFile(virtualPath, data);
    },
  };
  const workspace: RuntimeWorkspace = {
    filesystem: workspaceFilesystem,
  };
  const workspaceGateway = new ConfiguredWorkspaceGateway({
    base: new LocalBashWorkspaceGateway({
      fs: workspaceFs,
      root: agentWorkspaceDir,
    }),
    cwd: sandboxWorkingDirectory,
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
    workspaceActions: createWorkspaceActionDefinitions(workspaceGateway),
    communication,
    agentWorkspacePath,
    agentWorkspaceDir,
    agentMemoryPath,
    async dispose() {
      client.close();
    },
  };
}
