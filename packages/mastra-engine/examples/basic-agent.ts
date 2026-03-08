import dotenv from 'dotenv';
import { createAgent, executeAutonomousCycle } from '../src';

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

  const primaryThreadId = `primary-thread-${Date.now()}`;
  const resourceId = 'example-resource';

  console.log(`🚀 Starting Autonomous Cycle Test on primary thread: ${primaryThreadId}`);

  try {
    const result = await executeAutonomousCycle({
      agent,
      primaryThreadId,
      userPrompt: "Olá! Meu nome é Nicolas. Crie um arquivo 'test.txt' no workspace.",
      resourceId
    });
    
    console.log(`🤖 Agent final response: ${result.text}`);
    
    // Teste de continuidade na Primary Thread
    console.log("\n--- Second turn test ---");
    const result2 = await executeAutonomousCycle({
      agent,
      primaryThreadId,
      userPrompt: "Qual é o meu nome? E o arquivo foi criado?",
      resourceId
    });
    
    console.log(`🤖 Agent final response: ${result2.text}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during autonomous cycle execution:', errorMessage);
  }
}

main();
