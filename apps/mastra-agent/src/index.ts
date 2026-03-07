import { Agent } from '@mastra/core/agent';
import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { fastembed } from '@mastra/fastembed';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Envs não são obrigatórias em build time, apenas em runtime
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const workspaceDataPath = path.join(process.cwd(), 'workspace_data');

// Configurando o Workspace Local com busca híbrida
const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: workspaceDataPath,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: workspaceDataPath,
  }),
  bm25: true,
  vectorStore: new LibSQLVector({
    id: 'libsql-workspace-vector',
    url: 'file:libsql-workspace.db',
  }),
  embedder: fastembed,
  tools: {
    enabled: true,
    requireApproval: false,
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: 'view' },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: 'search_content' },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: 'find_files' },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: 'execute_command' },
  },
});

// Configurando Memória com LibSQL + FastEmbed
const memory = new Memory({
  storage: new LibSQLStore({
    id: 'libsql-agent-storage',
    url: 'file:libsql-agent.db',
  }),
  vector: new LibSQLVector({
    id: 'libsql-agent-vector',
    url: 'file:libsql-agent.db',
  }),
  embedder: fastembed,
  options: {
    lastMessages: 10,
    semanticRecall: {
      topK: 3,
      messageRange: 2,
    },
    workingMemory: {
      enabled: true,
    },
  },
});

const agent = new Agent({
  id: 'simple-agent',
  name: 'Simple Agent',
  instructions: 'You are a helpful assistant.',
  model: {
    providerId: 'openai',
    modelId: 'arcee-ai/trinity-large-preview:free',
    url: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY,
  },
  workspace: workspace,
  memory: memory,
});

async function main() {
  // Verificação obrigatória apenas em tempo de execução
  if (!OPENROUTER_API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('❌ OPENROUTER_API_KEY is required in production');
  }

  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ Skipping message test because OPENROUTER_API_KEY is missing.');
    return;
  }

  // Inicializa o workspace
  console.log('📦 Initializing workspace...');
  await workspace.init();

  console.log('🚀 Sending test message to Simple Agent...');
  try {
    const result = await agent.generate('Hello! Briefly introduce yourself and tell me if you remember our last interaction.', {
        memory: {
            resource: 'mastra-agent',
            thread: 'test-thread-1'
        }
    });
    console.log('🤖 Agent response:');
    console.log(result.text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error testing agent:', errorMessage);
  }
}

main();
