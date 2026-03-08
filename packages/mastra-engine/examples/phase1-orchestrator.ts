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

  // O Agente agora centraliza os identificadores através do seu ID
  const agent = await createAgent({
    id: 'orion',
    name: 'Orion Agent',
    instructions: 'You are a helpful assistant.',
    model: modelString,
    workspacePath: 'workspace_orion', // Opcional, mas mantido para organização local
  });

  console.log(`🚀 Starting Autonomous Cycle Test for Agent: ${agent.id}`);

  try {
    const result = await executeAutonomousCycle({
      agent,
      userPrompt: "Olá! Grave o texto 'Identificadores Derivados' num arquivo chamado 'ids.txt'.",
    });
    
    console.log(`🤖 Agent response: ${result.text}`);
    
    console.log("\n--- Second turn test ---");
    const result2 = await executeAutonomousCycle({
      agent,
      userPrompt: "O que você acabou de fazer?",
    });
    
    console.log(`🤖 Agent response: ${result2.text}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during autonomous cycle execution:', errorMessage);
  }
}

main().catch(console.error);
