import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import type { InputProcessorOrWorkflow, OutputProcessorOrWorkflow } from '@mastra/core/processors';
import type { Tool } from '@mastra/core/tools';
import {
  LocalFilesystem,
  LocalSandbox,
  Workspace as WorkspaceRuntime,
} from '@mastra/core/workspace';
import { createClient } from '@libsql/client';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createCommunicationModule,
  type CommunicationProvider,
  createExternalAccountTools,
  LongTermMemory,
  type AgentWakeEvent,
  createAgentMemory,
  createObservationalMemory,
  appendWorkingMemoryInstructions,
} from '@mastra-engine/core';
import type { LibSQLVector } from '@mastra/libsql';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig } from '../database/schema';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  pricingModelKey: string;
  omPricingModelKey?: string;
  modelProfileId?: string;
  omModelProfileId?: string;
  companyName?: string;
  companyContext?: string;
  providers?: CommunicationProvider[];
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
};

export type CreateAgentOptions = {
  longTermMemory?: boolean;
};

export type InternalAgentRuntime<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = {
  id: TAgentId;
  pricingModelKey: string;
  modelProfileId?: string;
  omPricingModelKey: string;
  omModelProfileId?: string;
  agent: Agent<TAgentId, TTools, TOutput, TRequestContext>;
  onReceiveMessage(handler: (event: AgentWakeEvent) => void): void;
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
  | 'pricingModelKey'
  | 'tools'
  | 'workflows'
  | 'agents'
  | 'omModel'
  | 'omPricingModelKey'
  | 'modelProfileId'
  | 'omModelProfileId'
  | 'companyName'
  | 'companyContext'
  | 'providers'
  | 'workspaceFilesystem'
  | 'workspaceSandbox'
> {
  workspaceBasePath: string;
}

const EXECUTION_ENVIRONMENT_INSTRUCTIONS = [
  'Execution environment:',
  '- This execution environment is not a chat interface.',
  '- Plain text responses are not routed back to the original sender or counterparty.',
  '- Any text you produce without using a tool call only becomes part of the internal execution flow of this agent.',
  '- No message, reply, or update is delivered to any external person, contact, or agent unless you send it through the appropriate tool call.',
].join('\n');

const RUN_STOP_INSTRUCTIONS = [
  'Execution control:',
  '- The current run only stops when you explicitly respond with `NO_ACTION_NEEDED` and do not call a tool.',
  '- Use `NO_ACTION_NEEDED` only when you have checked the current state and there is truly nothing else to do right now.',
  '- Any other visible text does not stop the run.',
  '- Plain text remains internal to the execution flow. If you need to communicate with any external counterpart, use the appropriate tool call.',
].join('\n');

function buildAgentSystemPrompt(
  instructions: string,
  companyName?: string,
  companyContext?: string,
): string;
function buildAgentSystemPrompt<T>(
  instructions: T,
  companyName?: string,
  companyContext?: string,
): T;
function buildAgentSystemPrompt(
  instructions: unknown,
  companyName?: string,
  companyContext?: string,
) {
  if (typeof instructions !== 'string') {
    return instructions;
  }

  const sections = [];

  if (companyName?.trim() || companyContext?.trim()) {
    sections.push('Company context:');

    if (companyName?.trim()) {
      sections.push(`- Company name: ${companyName.trim()}`);
    }

    if (companyContext?.trim()) {
      sections.push(`- Company information: ${companyContext.trim()}`);
    }
  }

  sections.push(instructions);
  sections.push(EXECUTION_ENVIRONMENT_INSTRUCTIONS);
  sections.push(RUN_STOP_INSTRUCTIONS);

  return sections.join('\n\n');
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
  const runtime = await createInternalAgentRuntime(config, options);
  return runtime.agent;
}

export async function createInternalAgentRuntime<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
  options: CreateAgentOptions = {},
): Promise<InternalAgentRuntime<TAgentId, TTools, TOutput, TRequestContext>> {
  const agentWorkspacePath = path.resolve(config.workspaceBasePath, config.id);
  const agentDatabasePath = path.resolve(agentWorkspacePath, 'database.db');
  const agentWorkspaceDir = config.workspaceFilesystem?.basePath
    ? path.resolve(agentWorkspacePath, config.workspaceFilesystem.basePath)
    : path.resolve(agentWorkspacePath, 'workspace');
  const agentMemoryPath = path.resolve(agentWorkspacePath, 'workspace-memory');
  const sandboxWorkingDirectory = config.workspaceSandbox?.workingDirectory
    ? path.resolve(agentWorkspacePath, config.workspaceSandbox.workingDirectory)
    : agentWorkspaceDir;

  await fs.mkdir(agentWorkspacePath, {
    recursive: true,
  });

  const dbUrl = `file:${agentDatabasePath}`;
  const client = createClient({ url: dbUrl });
  const storage = new LibSQLStore({ id: `${config.id}-storage`, client });
  const vector = new LibSQLVector({ id: `${config.id}-vector`, url: dbUrl });
  const workspace = new WorkspaceRuntime({
    autoSync: true,
    bm25: true,
    filesystem: new LocalFilesystem({
      basePath: agentWorkspaceDir,
    }),
    sandbox: new LocalSandbox({
      isolation: 'none',
      workingDirectory: sandboxWorkingDirectory,
    }),
  });

  await workspace.init();

  const communication = await createCommunicationModule({
    client,
    providers: config.providers ?? [],
  });
  const searchableTools = {
    ...createExternalAccountTools(communication),
    ...(config.tools ?? {}),
  } as Record<string, Tool<unknown, unknown>>;
  const memory = createAgentMemory({ storage, vector });
  const omModelKey = config.omModel ?? config.model;
  const omPricingModelKey = config.omPricingModelKey ?? config.pricingModelKey;

  const om = createObservationalMemory({
    storage,
    model: omModelKey,
  });

  const inputProcessors: InputProcessorOrWorkflow[] = [om];
  const outputProcessors: OutputProcessorOrWorkflow[] = [om];

  if (options.longTermMemory) {
    const longTermMemory = new LongTermMemory({
      om,
      agentId: config.id,
      memoryBasePath: agentMemoryPath,
      omModel: omModelKey,
    });
    inputProcessors.push(longTermMemory);
    outputProcessors.push(longTermMemory);
  }

  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(
      buildAgentSystemPrompt(config.instructions, config.companyName, config.companyContext),
    ),
    model: config.model,
    tools: searchableTools as TTools,
    workflows: config.workflows,
    workspace,
    agents: config.agents,
    memory,
    inputProcessors,
    outputProcessors,
  });

  return {
    id: config.id,
    pricingModelKey: config.pricingModelKey,
    modelProfileId: config.modelProfileId,
    omPricingModelKey,
    omModelProfileId: config.omModelProfileId,
    agent,
    onReceiveMessage: communication.onReceiveMessage,
  };
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
