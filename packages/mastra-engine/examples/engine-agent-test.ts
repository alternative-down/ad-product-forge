import dotenv from 'dotenv';
import { createAgent } from '../src';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ OPENROUTER_API_KEY is missing.');
    return;
  }

  const modelString = 'openrouter/arcee-ai/trinity-large-preview:free';

  // Usando a nova Factory que retorna um EngineAgent com generate sobreescrito
  const agent = await createAgent({
    id: 'orion-v2',
    name: 'Orion V2 Agent',
    instructions: 'You are a helpful assistant. Use your working memory.',
    model: modelString,
    workspacePath: 'workspace_v2',
  });

  console.log(`🚀 Starting Test for EngineAgent: ${agent.id}`);

  try {
    // Agora chamamos o generate direto! 
    // Toda a orquestração de threads, clonagem e OM acontece internamente.
    console.log("\n--- Turn 1: Introduction ---");
    const result = await agent.generate("Olá! Meu nome é Nicolas. Lembre-se disso.");
    console.log(`🤖 Agent: ${result.text}`);
    
    console.log("\n--- Turn 2: Validation ---");
    const result2 = await agent.generate("Qual é o meu nome?");
    console.log(`🤖 Agent: ${result2.text}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during EngineAgent test:', errorMessage);
  }
}

main().catch(console.error);
