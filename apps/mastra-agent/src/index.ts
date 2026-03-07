import { Agent } from '@mastra/core/agent';
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn('⚠️ OPENROUTER_API_KEY not set. Run with the key provided by Nicolas.');
}

// Configurando o Workspace Local
const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    // Cria uma pasta 'workspace_data' na raiz do app
    basePath: path.join(process.cwd(), 'workspace_data'),
  }),
  sandbox: new LocalSandbox(), // Sandbox local para execução
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
  workspace: workspace, // Injetando o workspace no agente
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
