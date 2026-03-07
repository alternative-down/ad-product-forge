import dotenv from 'dotenv';
import { createAgent } from './factory.js';

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

  // Usando a Factory para criar o agente
  const agent = await createAgent({
    id: 'simple-agent',
    name: 'Simple Agent',
    instructions: 'You are a helpful assistant.',
    model: modelString,
    workspacePath: 'workspace', // Criará a pasta e inicializará o workspace
  });

  const threadId = `test-thread-${Date.now()}`;
  const resourceId = 'mastra-agent-test';

  const questions = [
    "Olá! Meu nome é Nicolas e estou testando a factory do Mastra.",
    "Qual é o meu nome?",
    "Crie um arquivo chamado 'factory_test.txt' com o texto 'Factory is working!' no workspace.",
    "Leia o arquivo que você acabou de criar."
  ];

  console.log(`🚀 Starting conversation test with Factory on thread: ${threadId}`);

  for (const q of questions) {
    console.log(`\n👤 User: ${q}`);
    try {
      const result = await agent.generate(q, {
        memory: {
          resource: resourceId,
          thread: threadId
        }
      });
      console.log(`🤖 Agent: ${result.text}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error during conversation step:', errorMessage);
    }
  }
}

main();
