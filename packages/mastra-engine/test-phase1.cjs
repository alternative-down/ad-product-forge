const { createAgent, executeAutonomousCycle } = require('./dist/index');
const dotenv = require('dotenv');

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ OPENROUTER_API_KEY missing.');
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

  console.log(`🚀 Running Phase 1 Test...`);

  const result = await executeAutonomousCycle({
    agent,
    primaryThreadId,
    userPrompt: "Olá! Grave o texto 'Fase 1 OK' num arquivo chamado 'status.txt'.",
  });

  console.log(`🤖 Agent: ${result.text}`);

  const result2 = await executeAutonomousCycle({
    agent,
    primaryThreadId,
    userPrompt: "O que você gravou no arquivo?",
  });

  console.log(`🤖 Agent: ${result2.text}`);
}

main();
