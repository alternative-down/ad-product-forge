import path from 'node:path';

import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from './debug';
import { embedTextWithFastembed } from './agent/embedder';
import { LongTermMemory } from './agent/long-term-memory';
import {
  WORKING_MEMORY_TEMPLATE,
  appendWorkingMemoryInstructions,
} from './agent/working-memory';
import { OBSERVATIONAL_MEMORY_CONFIG } from './agent/observational-memory';

const MEMORY_WORKSPACE_ROOT = '.forge-memory';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
};

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
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
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { omModel = config.model, id, ...agentConfig } = config;

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
  try {
    await memoryWorkspaceVector.describeIndex({ indexName: memoryWorkspaceIndexName });
  } catch {
    const sampleEmbedding = await embedTextWithFastembed('forge-memory-bootstrap');
    await memoryWorkspaceVector.createIndex({
      indexName: memoryWorkspaceIndexName,
      dimension: sampleEmbedding.length,
      metric: 'cosine',
    });
  }
  forgeDebug('agent', 'memory workspace initialized', {
    path: memoryWorkspacePath,
    indexName: memoryWorkspaceIndexName,
  });

  const om = new ObservationalMemory({
    storage: storage.stores.memory!,
    model: omModel,
    scope: 'thread',
    observation: OBSERVATIONAL_MEMORY_CONFIG.observation,
    reflection: OBSERVATIONAL_MEMORY_CONFIG.reflection,
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
    instructions: appendWorkingMemoryInstructions(agentConfig.instructions),
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
          template: WORKING_MEMORY_TEMPLATE,
        },
      },
    }),
    inputProcessors: [om, longTermMemory],
    outputProcessors: [om, longTermMemory],
  });

  forgeDebug('agent', 'createForgeAgent:ready', {
    id: String(id),
  });

  return agent;
}
