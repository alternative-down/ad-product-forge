import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import type { InputProcessorOrWorkflow, OutputProcessorOrWorkflow } from '@mastra/core/processors';
import { LocalFilesystem, LocalSandbox, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { createClient } from '@libsql/client';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import path from 'node:path';
import {
  createCommunicationModule,
  type CommunicationProvider,
  createExternalAccountTools,
  createAgentWakeQueue,
  LongTermMemory,
  createAgentMemory,
  createObservationalMemory,
  appendWorkingMemoryInstructions,
  embedTextWithFastembed,
} from '@mastra-engine/core';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig } from '../database/schema.js';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  providers?: CommunicationProvider[];
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
};

export type CreateAgentOptions = {
  longTermMemory?: boolean;
};

export interface CreateAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> extends Pick<
    CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    | 'id'
    | 'name'
    | 'description'
    | 'instructions'
    | 'model'
    | 'tools'
    | 'workflows'
    | 'agents'
    | 'omModel'
    | 'providers'
    | 'workspaceFilesystem'
    | 'workspaceSandbox'
  > {
  workspaceBasePath: string;
}

export async function createAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
  options: CreateAgentOptions = {},
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const agentWorkspacePath = path.resolve(config.workspaceBasePath, config.id);
  const agentDatabasePath = path.resolve(agentWorkspacePath, 'database.db');
  const agentWorkspaceDir = config.workspaceFilesystem?.basePath
    ? path.resolve(agentWorkspacePath, config.workspaceFilesystem.basePath)
    : path.resolve(agentWorkspacePath, 'workspace');
  const agentMemoryPath = path.resolve(agentWorkspacePath, 'workspace-memory');
  const sandboxWorkingDirectory = config.workspaceSandbox?.workingDirectory
    ? path.resolve(agentWorkspacePath, config.workspaceSandbox.workingDirectory)
    : agentWorkspaceDir;

  const dbUrl = `file:${agentDatabasePath}`;
  const client = createClient({ url: dbUrl });
  const storage = new LibSQLStore({ id: `${config.id}-storage`, client });
  const vector = new LibSQLVector({ id: `${config.id}-vector`, url: dbUrl });
  const workspaceVector = new LibSQLVector({ id: `${config.id}-workspace-vector`, url: dbUrl });
  const workspaceSearchIndex = `${config.id}_workspace_search`.replace(/[^a-zA-Z0-9_]/g, '_');
  const workspace = new WorkspaceRuntime({
    autoSync: true,
    bm25: true,
    vectorStore: workspaceVector,
    embedder: embedTextWithFastembed,
    searchIndexName: workspaceSearchIndex,
    filesystem: new LocalFilesystem({
      basePath: agentWorkspaceDir,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: sandboxWorkingDirectory,
    }),
  });

  await workspace.init();

  const communication = await createCommunicationModule({
    client,
    providers: config.providers ?? [],
  });
  const tools = {
    ...createExternalAccountTools(communication),
    ...(config.tools ?? {}),
  } as TTools;
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });

  const inputProcessors: InputProcessorOrWorkflow[] = [om];
  const outputProcessors: OutputProcessorOrWorkflow[] = [om];

  if (options.longTermMemory) {
    const longTermMemory = await LongTermMemory.create({
      agentId: config.id,
      om,
      memoryBasePath: agentMemoryPath,
    });
    inputProcessors.push(longTermMemory);
    outputProcessors.push(longTermMemory);
  }

  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(config.instructions),
    model: config.model,
    tools,
    workflows: config.workflows,
    workspace,
    agents: config.agents,
    memory,
    inputProcessors,
    outputProcessors,
  });
  const wakeQueue = createAgentWakeQueue({
    run: () =>
      agent.generate('Pending external activity detected.\n\nCheck your messages, inspect what is pending, and process what matters.', {
        memory: {
          thread: config.id,
          resource: config.id,
        },
        maxSteps: 1000,
      }),
  });
  communication.onReceiveMessage(wakeQueue.notifyExternalEvent);

  return agent;
}

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  return createAgent(config, { longTermMemory: true });
}
