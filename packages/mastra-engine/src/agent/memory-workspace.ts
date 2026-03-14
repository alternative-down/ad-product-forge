import path from 'node:path';

import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import { LibSQLVector } from '@mastra/libsql';

import { embedTextWithFastembed } from './embedder';

const MEMORY_WORKSPACE_ROOT = '.forge-memory';

export async function createMemoryWorkspace(agentId: string) {
  const indexName = `${agentId}_memory_search`.replace(/[^a-zA-Z0-9_]/g, '_');
  const vectorStore = new LibSQLVector({
    id: `${agentId}-memory-workspace-vector`,
    url: `file:./${agentId}-memory-workspace.db`,
  });
  const workspace = new Workspace({
    bm25: true,
    autoSync: true,
    autoIndexPaths: ['/'],
    embedder: embedTextWithFastembed,
    filesystem: new LocalFilesystem({ basePath: path.resolve(MEMORY_WORKSPACE_ROOT, agentId) }),
    sandbox: new LocalSandbox({ workingDirectory: path.resolve(MEMORY_WORKSPACE_ROOT, agentId) }),
    vectorStore,
    searchIndexName: indexName,
  });

  await workspace.init();

  return {
    workspace,
    vectorStore,
    indexName,
  };
}
