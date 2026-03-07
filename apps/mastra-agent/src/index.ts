import { Agent } from '@mastra/core/agent';
import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn('⚠️ OPENROUTER_API_KEY not set. Run with the key provided by Nicolas.');
}

const workspaceDataPath = path.join(process.cwd(), 'workspace_data');

// Configurando o Workspace Local
const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: workspaceDataPath,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: workspaceDataPath, // Define o diretório de trabalho do sandbox
  }),
  tools: {
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { enabled: true, requireApproval: false, name: 'view' },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { enabled: true, requireApproval: false, name: 'search_content' },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { enabled: true, requireApproval: false, name: 'find_files' },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { enabled: true, requireApproval: false, name: 'execute_command' },
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
});

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.log('Skipping message test because API key is missing.');
    return;
  }

  // Inicializa o workspace (cria pastas, prepara sandbox)
  console.log('📦 Initializing workspace...');
  await workspace.init();

  console.log('🚀 Sending test message to Simple Agent...');
  try {
    const result = await agent.generate('Hello! What is your model name and who created you?');
    console.log('🤖 Agent response:');
    console.log(result.text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error testing agent:', errorMessage);
  }
}

main();
