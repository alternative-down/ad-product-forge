import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import {
  type InputProcessorOrWorkflow,
  type OutputProcessorOrWorkflow,
} from '@mastra/core/processors';
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

/**
 * Interface for Mastra memory store with createThread method.
 * This extends the type definition to include the createThread method.
 */
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
import {
  createCommunicationModule,
  type CommunicationModule,
  type CommunicationProvider,
  createExternalAccountTools,
  LongTermMemory,
  type AgentWakeEvent,
  createAgentMemory,
  createObservationalMemory,
  toMastraSafeIdentifier,
} from '@mastra-engine/core';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig, WorkspaceSkillsConfig } from '../database/schema';
import { ensureBundledWorkspaceSkills } from './bundled-workspace-skills';

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
  roleName?: string;
  roleDescription?: string;
  providers?: CommunicationProvider[];
  communication?: CommunicationModule;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
  workspaceSkills?: WorkspaceSkillsConfig;
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
  mastraId: string;
  pricingModelKey: string;
  modelProfileId?: string;
  omPricingModelKey: string;
  omModelProfileId?: string;
  agent: Agent<TAgentId, TTools, TOutput, TRequestContext>;
  communication: CommunicationModule;
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
  | 'roleName'
  | 'roleDescription'
  | 'providers'
  | 'communication'
  | 'workspaceFilesystem'
  | 'workspaceSandbox'
  | 'workspaceSkills'
> {
  workspaceBasePath: string;
}

function buildAgentSystemPrompt(input: {
  instructions: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  companyName?: string;
  companyContext?: string;
}): string;
function buildAgentSystemPrompt<T>(input: {
  instructions: T;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  companyName?: string;
  companyContext?: string;
}): T;
function buildAgentSystemPrompt(input: {
  instructions: unknown;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  companyName?: string;
  companyContext?: string;
}) {
  if (typeof input.instructions !== 'string') {
    return input.instructions;
  }

  const sections = [
    [
      '<agent_identity>',
      '## Agent Identity',
      `- Agent id: ${input.agentId}`,
      `- Agent slug: ${input.agentSlug}`,
      `- Agent name: ${input.agentName}`,
      input.agentDescription?.trim() ? `- Agent description: ${input.agentDescription.trim()}` : null,
      input.roleName?.trim() ? `- Role name: ${input.roleName.trim()}` : null,
      input.roleDescription?.trim() ? `- Role description: ${input.roleDescription.trim()}` : null,
      '</agent_identity>',
    ].filter(Boolean).join('\n'),
    [
      '<company_context>',
      '## Company Context',
      input.companyName?.trim() ? `- Company name: ${input.companyName.trim()}` : null,
      input.companyContext?.trim() ? `- Company information: ${input.companyContext.trim()}` : null,
      '</company_context>',
    ].filter(Boolean).join('\n'),
    [
      '<assigned_instructions>',
      '## Assigned Instructions',
      input.instructions.trim(),
      '</assigned_instructions>',
    ].join('\n'),
    [
      '<operating_directives>',
      '## Operating Directives',
      '- This is a real operating environment for a real company running through software. It is not a simulation, game, or roleplay.',
      '- Strictly follow the instructions you are directly responsible for and anything clearly derived from them.',
      '- Do not leave your role, invent responsibilities, or act outside your assignment boundaries.',
      '- Operate proactively. Do not wait for instructions when you can inspect relevant state, messages, projects, code, schedules, or colleagues on your own.',
      '- Help run the company in reality: protect quality, increase revenue when justified, and reduce unnecessary costs when justified.',
      '- Verify facts before acting. Do not speculate, emulate, invent results, or claim work that was not actually checked or completed.',
      '- Stay disciplined inside your role while coordinating with colleagues when their context is relevant to your work.',
      '- Do not respond to every message just because you received it. If a message is outside your role, outside your responsibility, or not part of your conversation context, do not treat it as your job.',
      '</operating_directives>',
    ].join('\n'),
    [
      '<execution_environment>',
      '## Execution Environment',
      '- This execution environment is not a chat interface.',
      '- Your workspace is isolated from the workspaces of other agents. Files in your workspace are private unless you explicitly share or send them.',
      '- Plain text responses are not routed back to the original sender or counterparty.',
      '- Any text you produce without using a tool call only becomes part of the internal execution flow of this agent.',
      '- No message, reply, or update is delivered to any external person, contact, or agent unless you send it through the appropriate tool call.',
      '- The send_message tool can include file attachments. Those files are transferred to the recipient in both direct messages and group conversations.',
      '- Long-term memory exists and is automatic. The system may inject retrieved memory into your context without any action from you.',
      '- Treat retrieved long-term memory as your own memory, but remember it can be stale, incomplete, or wrong.',
      '- You do not need to perform any special memory-management action unless a separate instruction explicitly tells you to do so.',
      '- The current run only stops when you explicitly respond with `STOP_AND_IDLE` and do not call a tool.',
      '- `NO_ACTION_NEEDED` does not stop the run. It only tells the system to ignore that visible text and continue.',
      '- Stopping is the exception, not the default. Before using `STOP_AND_IDLE`, make sure you checked for missed actions, pending work, relevant messages, relevant state changes, and obvious next steps inside your role.',
      '- Use `STOP_AND_IDLE` only when you truly do not need and cannot reasonably perform any further action right now.',
      '- Do not use `NO_ACTION_NEEDED` to abandon work. Use it only when you do not want to send visible text and you still intend to continue the run through further steps or tool usage.',
      '- Do not stay idle waiting for instructions if there is relevant work, verification, follow-up, coordination, or inspection you can still do within your role.',
      '- Any other visible text does not stop the run.',
      '</execution_environment>',
    ].join('\n'),
  ];

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
  const mastraId = toMastraSafeIdentifier(config.id);
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
    skills: config.workspaceSkills ?? ['**/skills'],
  });

  await workspace.init();
  await ensureBundledWorkspaceSkills(agentWorkspaceDir);
  // Initialize memory store by creating a thread (Issue #212)
  // This ensures mastra_messages and mastra_threads tables exist
  if (hasCreateThread(storage.stores.memory)) {
    await storage.stores.memory.createThread({
      resourceId: mastraId,
      threadId: mastraId,
    });
  }

  const communication = config.communication ?? await createCommunicationModule({
    client,
    providers: config.providers ?? [],
    workspace,
    workspaceRoot: agentWorkspaceDir,
  });
  const allAgentTools = {
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
      mastraId,
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
    instructions: buildAgentSystemPrompt({
      agentId: config.id,
      agentSlug: mastraId,
      agentName: config.name,
      agentDescription: config.description,
      roleName: config.roleName,
      roleDescription: config.roleDescription,
      instructions: config.instructions,
      companyName: config.companyName,
      companyContext: config.companyContext,
    }),
    model: config.model,
    tools: allAgentTools as TTools,
    workflows: config.workflows,
    workspace,
    agents: config.agents,
    memory,
    inputProcessors,
    outputProcessors,
  });

  return {
    id: config.id,
    mastraId,
    pricingModelKey: config.pricingModelKey,
    modelProfileId: config.modelProfileId,
    omPricingModelKey,
    omModelProfileId: config.omModelProfileId,
    agent,
    communication,
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
