import path from 'node:path';

import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../debug';
import { ensureWorkspaceVectorIndex, LongTermMemory } from '../memory/long-term-memory';

const MEMORY_WORKSPACE_ROOT = '.forge-memory';

async function embedTextWithFastembed(text: string): Promise<number[]> {
  const result = await fastembed.doEmbed({ values: [text] });
  return result.embeddings[0] ?? [];
}

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  contextLimit?: number;
};

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
>(
  config: Pick<
    CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    | 'id'
    | 'name'
    | 'description'
    | 'instructions'
    | 'model'
    | 'tools'
    | 'workflows'
    | 'workspace'
    | 'agents'
    | 'omModel'
    | 'contextLimit'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { omModel = config.model, id, contextLimit = 150000, ...agentConfig } = config;
  const omConfig = {
    observation: { messageTokens: 15000 },
    reflection: { observationTokens: 20000 },
  };
  const workingMemoryInstructions = [
    'Working memory is your constitution.',
    'Use it only for stable, long-lived facts about yourself.',
    'Store only your identity, role, mission, principles, permanent constraints, and stable preferences explicitly defined for you.',
    'Do not store conversation history, recent requests, event summaries, users, channels, links, in-progress tasks, current context, logs, counts, or transient facts.',
    'If the information is about a user, an external event, a current task, or something likely to change soon, do not put it in working memory.',
    'Keep it short, dense, and stable.',
    'Use short bullets.',
  ].join('\n');
  const instructions =
    typeof agentConfig.instructions === 'string'
      ? `${agentConfig.instructions}\n\n${workingMemoryInstructions}`
      : agentConfig.instructions;

  forgeDebug('agent', 'createForgeAgent:start', {
    id: String(id),
    hasWorkspace: Boolean(agentConfig.workspace),
  });

  const dbUrl = `file:./${config.id}.db`;
  const memoryWorkspacePath = path.resolve(MEMORY_WORKSPACE_ROOT, config.id);
  const memoryWorkspaceIndexName = `${config.id}_memory_search`.replace(/[^a-zA-Z0-9_]/g, '_');

  const storage = new LibSQLStore({ id: `${config.id}-storage`, url: dbUrl });
  const vector = new LibSQLVector({ id: `${config.id}-vector`, url: dbUrl });
  const memoryWorkspaceVector = new LibSQLVector({
    id: `${config.id}-memory-workspace-vector`,
    url: `file:./${config.id}-memory-workspace.db`,
  });

  const memoryWorkspace = new Workspace({
    bm25: true,
    autoSync: true,
    autoIndexPaths: ['/'],
    embedder: embedTextWithFastembed,
    filesystem: new LocalFilesystem({ basePath: memoryWorkspacePath }),
    sandbox: new LocalSandbox({ workingDirectory: memoryWorkspacePath }),
    vectorStore: memoryWorkspaceVector,
    searchIndexName: memoryWorkspaceIndexName,
  });

  await memoryWorkspace.init();
  await ensureWorkspaceVectorIndex(memoryWorkspaceVector, memoryWorkspaceIndexName);
  forgeDebug('agent', 'memory workspace initialized', {
    path: memoryWorkspacePath,
    indexName: memoryWorkspaceIndexName,
  });

  const om = new ObservationalMemory({
    storage: storage.stores.memory,
    model: omModel || config.model,
    scope: 'thread',
    observation: omConfig.observation,
    reflection: omConfig.reflection,
  });

  const longTermMemory = new LongTermMemory({
    om,
    workspace: memoryWorkspace,
    vectorStore: memoryWorkspaceVector,
    graphIndexName: memoryWorkspaceIndexName,
  });

  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id,
    ...agentConfig,
    instructions,
    memory: new Memory({
      embedder: fastembed,
      storage,
      vector,
      options: {
        lastMessages: Number.MAX_SAFE_INTEGER,
        semanticRecall: false,
        observationalMemory: false,
        workingMemory: {
          enabled: true,
          scope: 'thread',
          template: [
            'Identity',
            '-',
            'Role',
            '-',
            'Mission',
            '-',
            'Principles',
            '-',
            'Permanent constraints',
            '-',
            'Stable preferences',
            '-',
          ].join('\n'),
        },
      },
    }),
    inputProcessors: [om, longTermMemory],
    outputProcessors: [om, longTermMemory],
  });

  forgeDebug('agent', 'createForgeAgent:ready', {
    id: String(id),
    contextLimit,
  });

  const defaultMemoryContext = {
    thread: String(id),
    resource: String(id),
  };

  const originalGenerate = agent.generate.bind(agent);
  agent.generate = ((...args: Parameters<typeof agent.generate>) => {
    const [messages, options] = args;

    return originalGenerate(messages, {
      ...(options ?? {}),
      maxSteps: 1000,
      memory: options?.memory ?? defaultMemoryContext,
    });
  }) as typeof agent.generate;

  const originalStream = agent.stream.bind(agent);
  agent.stream = ((...args: Parameters<typeof agent.stream>) => {
    const [messages, options] = args;

    return originalStream(messages, {
      ...(options ?? {}),
      maxSteps: 1000,
      memory: options?.memory ?? defaultMemoryContext,
    });
  }) as typeof agent.stream;

  return agent;
}
