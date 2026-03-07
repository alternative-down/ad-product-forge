import dotenv from 'dotenv';
import { createAgent } from '../src';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function main() {
  if (!OPENROUTER_API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('❌ OPENROUTER_API_KEY is required in production');
  }

  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ Skipping message test because OPENROUTER_API_KEY is missing.');
    return;
  }

  const modelString = 'openrouter/arcee-ai/trinity-large-preview:free';

  // Usando a Factory do pacote para criar o agente
  const agent = await createAgent({
    id: 'example-agent',
    name: 'Example Agent',
    instructions: 'You are a helpful assistant.',
    model: modelString,
    workspacePath: 'workspace_example',
  });

  const threadId = `example-thread-${Date.now()}`;
  const resourceId = 'example-resource';

  console.log(`🚀 Starting example conversation on thread: ${threadId}`);

  try {
    const result = await agent.generate('Hello! Tell me a fun fact about Mastra.', {
      memory: {
        resource: resourceId,
        thread: threadId
      }
    });
    console.log(`🤖 Agent: ${result.text}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during example execution:', errorMessage);
  }
}

main();
