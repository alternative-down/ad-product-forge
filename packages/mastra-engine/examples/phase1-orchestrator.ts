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

  const agent = await createAgent({
    id: 'test-agent',
    name: 'Test Agent',
    instructions: 'You are a helpful assistant.',
    model: modelString,
    workspacePath: 'test_workspace',
  });

  const primaryThreadId = `test-primary-${Date.now()}`;

  console.log(`🚀 Running Phase 1 Orchestrator Test...`);

  const result = await executeAutonomousCycle({
    agent,
    primaryThreadId,
    userPrompt: "Olá! Grave o texto 'Fase 1 OK' num arquivo chamado 'status.txt'.",
  });

  console.log(`🤖 Agent response: ${result.text}`);

  const result2 = await executeAutonomousCycle({
    agent,
    primaryThreadId,
    userPrompt: "O que você gravou no arquivo?",
  });

  console.log(`🤖 Agent response: ${result2.text}`);
}

main().catch(console.error);
